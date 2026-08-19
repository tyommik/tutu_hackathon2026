"use client";

import { useEffect, useRef, useState } from "react";
import { renderLightMarkdown } from "@/lib/lightMarkdown";
import { drawPhrase, FIRST_PHRASE } from "@/lib/thinking";
import { groupMessages } from "@/lib/activityLog";
import { pluralRu } from "@/lib/progress";
import { useVoiceInput } from "./useVoiceInput";
import { useTrip } from "@/store/useTrip";

export function CopilotCard() {
  const { copilot, askCopilot, stopCopilot, setCopilotSize } = useTrip();
  // идут ли сейчас реальные шаги — от этого живёт последняя группа статусов
  const agentBusy = useTrip(
    (s) =>
      Object.values(s.legStatus).some((v) => v === "loading") ||
      Object.values(s.stayStatus).some((v) => v === "loading") ||
      Object.values(s.legTransfers).some((t) => t.loading),
  );
  const [text, setText] = useState("");
  /**
   * Развёрнутость групп статусов по индексу первого статуса в ленте: явный
   * клик пользователя важнее умолчания «живая группа развёрнута».
   */
  const [openSteps, setOpenSteps] = useState<Record<number, boolean>>({});
  const [phrase, setPhrase] = useState(FIRST_PHRASE);
  /**
   * Мешок фраз и текущая фраза — в ref, а не в state: их читает и меняет
   * таймер. В state они пересоздавали бы интервал на каждом шаге, а
   * менять их внутри setPhrase нельзя — в dev React вызывает функцию
   * обновления дважды и мешок расходовался бы вдвое быстрее.
   */
  const bag = useRef<string[]>([]);
  const phraseRef = useRef(FIRST_PHRASE);
  const size = copilot.size;
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // запись/волна/распознавание — общий хук со стартовым экраном
  const vo = useVoiceInput((t) => setText((prev) => (prev ? `${prev} ${t}` : t)));

  // высота поля подстраивается под текст; max-height ограничивает рост в CSS
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight не включает рамку, а box-sizing: border-box — включает
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text, size]);

  // вопрос мог прийти из карточки плана — прокручиваем к нему сами
  useEffect(() => {
    listRef.current?.scrollTo({ top: 99999 });
  }, [copilot.messages.length, copilot.loading]);

  // Каждый запрос начинается с «Думаю...», дальше фразы идут вразнобой.
  useEffect(() => {
    if (!copilot.loading) return;
    setPhrase(FIRST_PHRASE);
    phraseRef.current = FIRST_PHRASE;
    bag.current = [];
    const t = setInterval(() => {
      const d = drawPhrase(bag.current, phraseRef.current);
      bag.current = d.bag;
      phraseRef.current = d.phrase;
      setPhrase(d.phrase);
    }, 2000);
    return () => clearInterval(t);
  }, [copilot.loading]);


  const send = () => {
    const t = text.trim();
    if (!t || copilot.loading) return;
    setText("");
    void askCopilot(t).then(() => {
      listRef.current?.scrollTo({ top: 99999 });
    });
  };

  if (size === "collapsed") {
    return (
      <button className="fab" onClick={() => setCopilotSize("normal")} aria-label="Открыть копилота">
        ✦
        <style jsx>{`
          .fab {
            position: absolute;
            left: 14px;
            bottom: 14px;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            background: var(--panel);
            border: 1px solid var(--line);
            box-shadow: var(--shadow);
            font-size: 18px;
            color: var(--accent);
            z-index: 20;
          }
        `}</style>
      </button>
    );
  }

  const large = size === "large";
  return (
    <div className={`cop${large ? " large" : ""}`}>
      <div className="head">
        <span className="spark">✦</span>
        Тревис — твой копилот
        <span className="tag">советы ИИ</span>
        <button
          className="min"
          onClick={() => setCopilotSize(large ? "normal" : "large")}
          aria-label={large ? "Уменьшить" : "Развернуть во всю высоту"}
          title={large ? "Обычный размер" : "Развернуть во всю высоту"}
        >
          {large ? "⤡" : "⤢"}
        </button>
        <button className="min" onClick={() => setCopilotSize("collapsed")} aria-label="Свернуть">
          —
        </button>
      </div>

      <div className="list" ref={listRef}>
        {copilot.messages.length === 0 && !copilot.unavailable && (
          <div className="hint">
            Опишите поездку — соберу черновик: «хочу из Оскола в Португалию через Стамбул в сентябре».
            Или спросите про план: бюджет, стыковки, что посмотреть в городах.
          </div>
        )}
        {(() => {
          const blocks = groupMessages(copilot.messages);
          return blocks.map((b, bi) => {
            if (b.kind === "message") {
              const m = b.message;
              return m.role === "assistant" ? (
                <div
                  key={b.index}
                  className="msg assistant md"
                  // рендер санитайзит HTML и схемы ссылок (см. lib/lightMarkdown)
                  dangerouslySetInnerHTML={{ __html: renderLightMarkdown(m.content) }}
                />
              ) : (
                <div key={b.index} className="msg user">
                  {m.content}
                </div>
              );
            }
            // группа статусов: живая (агент ещё работает) развёрнута сама,
            // завершённая сворачивается в строку-экспандер
            const live = bi === blocks.length - 1 && agentBusy;
            const open = openSteps[b.index] ?? live;
            return (
              <div key={`s-${b.index}`} className="steps">
                <button
                  className="steps-head"
                  aria-expanded={open}
                  onClick={() => setOpenSteps((o) => ({ ...o, [b.index]: !open }))}
                >
                  <span className={`chev${open ? " o" : ""}`} aria-hidden>
                    ▸
                  </span>
                  {live
                    ? "Работаю…"
                    : `Как я искал · ${b.items.length} ${pluralRu(b.items.length, ["шаг", "шага", "шагов"])}`}
                </button>
                {open && (
                  <div className="steps-body" role="status">
                    {b.items.map((t, ti) => (
                      <div key={ti} className="step">
                        {t}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          });
        })()}
        {copilot.loading && (
          <div className="thinking" role="status">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/thinking.png" alt="" width={40} height={40} />
            {/* key — чтобы новая фраза проявлялась, а не подменялась рывком */}
            <span key={phrase}>{phrase}</span>
          </div>
        )}
        {copilot.unavailable && <div className="msg err">{copilot.unavailable}</div>}
      </div>

      {vo.error && <div className="voice-err">{vo.error}</div>}
      <div className="row">
        <div className="field">
          <textarea
            ref={inputRef}
            value={text}
            rows={1}
            placeholder="Куда едем? Shift+Enter — новая строка"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            disabled={copilot.loading}
            readOnly={vo.voice === "rec"}
          />
          {vo.voice === "rec" && <canvas ref={vo.canvasRef} className="wave" />}
          {vo.voice === "rec" ? (
            <>
              <button
                className="micbtn cancel"
                onClick={vo.cancel}
                aria-label="Отменить запись"
                title="Отменить запись"
              >
                ✕
              </button>
              <button
                className="micbtn done"
                onClick={vo.finish}
                aria-label="Завершить запись и распознать"
                title="Завершить запись и распознать"
              >
                ✓
              </button>
            </>
          ) : (
            <button
              className="micbtn"
              onClick={vo.start}
              disabled={copilot.loading || vo.voice === "busy"}
              aria-label="Надиктовать голосом"
              title="Надиктовать голосом"
            >
              {vo.voice === "busy" ? "…" : <span className="mic-ico" />}
            </button>
          )}
        </div>
        {copilot.loading ? (
          <button
            className="btn stop"
            onClick={() => {
              const draft = stopCopilot();
              if (draft) setText(draft);
            }}
            aria-label="Остановить генерацию"
            title="Остановить генерацию"
          >
            ■
          </button>
        ) : (
          <button className="btn" onClick={send} disabled={!text.trim()} aria-label="Отправить">
            →
          </button>
        )}
      </div>

      <style jsx>{`
        .cop {
          position: absolute;
          left: 14px;
          bottom: 14px;
          width: 400px;
          height: min(600px, calc(100% - 28px));
          transition: width 0.18s ease, height 0.18s ease;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
          box-shadow: var(--shadow);
          padding: 14px 16px;
          z-index: 20;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        /* третий размер — колонка вровень с планом поездки: те же отступы и ширина */
        .cop.large {
          top: 14px;
          height: auto;
          width: var(--panel-w);
        }
        .head {
          display: flex;
          align-items: center;
          gap: 8px;
          font-weight: 600;
          font-size: 15px;
        }
        .spark { color: var(--accent); }
        .tag {
          margin-left: auto;
          font-size: 12px;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: var(--ink-3);
        }
        .min {
          color: var(--ink-3);
          padding: 0 4px;
          font-size: 15px;
        }
        .list {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .hint { font-size: 14px; color: var(--ink-2); line-height: 1.5; }
        .msg {
          font-size: 14.5px;
          line-height: 1.5;
          border-radius: 9px;
          padding: 9px 12px;
          white-space: pre-wrap;
        }
        .msg.user {
          background: var(--accent-soft);
          align-self: flex-end;
          max-width: 90%;
        }
        .msg.assistant { background: var(--panel-2); }
        /* Пока копилот думает: глобус с самолётами крутится по орбите. */
        .thinking {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 2px;
        }
        .thinking img {
          width: 40px;
          height: 40px;
          animation: orbit 2.6s linear infinite;
        }
        @media (prefers-color-scheme: dark) {
          .thinking img {
            /*
             * У иконки чёрная обводка: на тёмной панели тонкие орбиты вокруг
             * глобуса сливаются с фоном. Тень без смещения обводит силуэт по
             * альфа-каналу и возвращает их.
             */
            filter: drop-shadow(0 0 0.7px rgba(255, 255, 255, 0.9));
          }
        }
        .thinking span {
          font-size: 14.5px;
          color: var(--ink-2);
          animation: phrasein 0.3s ease;
        }
        @keyframes phrasein {
          from { opacity: 0; }
        }
        @keyframes orbit {
          to { transform: rotate(-360deg); }
        }
        .msg.err { background: var(--warn-bg); color: var(--warn); }
        /* Группа реальных шагов агента: строка-экспандер + журнал под ней. */
        .steps { align-self: stretch; }
        .steps-head {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 2px 4px;
          background: none;
          border: none;
          font-size: 12px;
          color: var(--ink-3);
          cursor: pointer;
        }
        .steps-head:hover { color: var(--ink-2); }
        .chev {
          font-size: 10px;
          transition: transform 0.15s ease;
        }
        .chev.o { transform: rotate(90deg); }
        .steps-body {
          margin: 3px 0 2px 9px;
          padding: 4px 0 4px 12px;
          border-left: 2px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .step {
          font-size: 12px;
          line-height: 1.45;
          color: var(--ink-2);
        }
        .voice-err { font-size: 13px; color: var(--warn); }
        .row { display: flex; gap: 8px; align-items: flex-end; }
        .field { position: relative; flex: 1; min-width: 0; display: flex; }
        .field textarea {
          flex: 1;
          min-width: 0;
          font-size: 15px;
          line-height: 1.4;
          padding: 9px 36px 9px 12px;
          resize: none;
          max-height: 140px;
          overflow-y: auto;
        }
        /* волна лежит внутри рамки поля и прячет текст под собой;
           canvas — replaced-элемент: inset его не растягивает, размеры явные */
        .wave {
          position: absolute;
          top: 1px;
          left: 1px;
          width: calc(100% - 65px);
          height: calc(100% - 2px);
          display: block;
          border-radius: 7px;
          background: var(--panel);
          color: var(--accent);
        }
        .micbtn {
          position: absolute;
          right: 4px;
          bottom: 4px;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 7px;
          color: var(--ink-3);
          font-size: 14px;
        }
        .micbtn:hover { color: var(--accent); background: var(--panel-2); }
        .micbtn.cancel {
          right: 36px;
          color: var(--warn);
        }
        .micbtn.cancel:hover { color: var(--warn); }
        .micbtn.done {
          color: var(--accent);
          font-weight: 600;
          animation: micpulse 1.2s ease-in-out infinite;
        }
        .mic-ico {
          display: block;
          width: 17px;
          height: 17px;
          background: currentColor;
          -webkit-mask: url(/mic.png) center / contain no-repeat;
          mask: url(/mic.png) center / contain no-repeat;
        }
        @keyframes micpulse {
          50% { opacity: 0.45; }
        }
        .row .btn { padding: 9px 16px; font-size: 15px; }
        .row .btn.stop { color: var(--warn); }
      `}</style>
    </div>
  );
}
