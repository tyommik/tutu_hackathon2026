"use client";

import { useEffect, useRef, useState } from "react";
import { renderLightMarkdown } from "@/lib/lightMarkdown";
import { drawPhrase, FIRST_PHRASE } from "@/lib/thinking";
import { useTrip } from "@/store/useTrip";

export function CopilotCard() {
  const { copilot, askCopilot, setCopilotSize } = useTrip();
  const [text, setText] = useState("");
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
  // idle → rec (идёт запись) → busy (ждём Whisper) → idle
  const [voice, setVoice] = useState<"idle" | "rec" | "busy">("idle");
  const [voiceErr, setVoiceErr] = useState("");
  const recRef = useRef<MediaRecorder | null>(null);

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

  // Живую запись глушим при уходе со страницы, чтобы не оставить микрофон включённым.
  useEffect(() => {
    return () => {
      const rec = recRef.current;
      if (rec && rec.state !== "inactive") {
        rec.onstop = null;
        rec.stop();
        rec.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  const toggleVoice = async () => {
    if (voice === "busy") return;
    if (voice === "rec") {
      recRef.current?.stop();
      return;
    }
    setVoiceErr("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setVoiceErr("Нет доступа к микрофону — разрешите его в браузере или введите текст руками.");
      return;
    }
    const rec = new MediaRecorder(
      stream,
      MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? { mimeType: "audio/webm;codecs=opus" }
        : undefined,
    );
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setVoice("busy");
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const form = new FormData();
        form.append("audio", blob, "voice.webm");
        const res = await fetch("/api/transcribe", { method: "POST", body: form });
        const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
        if (data.text) {
          setText((t) => (t ? `${t} ${data.text}` : data.text!));
        } else {
          setVoiceErr("Речь не распозналась — попробуйте ещё раз.");
        }
      } catch (e) {
        setVoiceErr(e instanceof Error ? e.message : String(e));
      } finally {
        setVoice("idle");
        recRef.current = null;
      }
    };
    recRef.current = rec;
    rec.start();
    setVoice("rec");
  };

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
        Копилот
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
        {copilot.messages.map((m, i) =>
          m.role === "assistant" ? (
            <div
              key={i}
              className="msg assistant md"
              // рендер санитайзит HTML и схемы ссылок (см. lib/lightMarkdown)
              dangerouslySetInnerHTML={{ __html: renderLightMarkdown(m.content) }}
            />
          ) : (
            <div key={i} className="msg user">
              {m.content}
            </div>
          ),
        )}
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

      {voiceErr && <div className="voice-err">{voiceErr}</div>}
      <div className="row">
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          placeholder={voice === "rec" ? "Говорите..." : "Куда едем? Shift+Enter — новая строка"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={copilot.loading}
        />
        <button
          className={`btn mic${voice === "rec" ? " rec" : ""}`}
          onClick={toggleVoice}
          disabled={copilot.loading || voice === "busy"}
          aria-label={voice === "rec" ? "Остановить запись" : "Надиктовать голосом"}
          title={voice === "rec" ? "Остановить запись" : "Надиктовать голосом"}
        >
          {voice === "busy" ? "…" : voice === "rec" ? "■" : "🎙"}
        </button>
        <button className="btn" onClick={send} disabled={copilot.loading || !text.trim()}>
          →
        </button>
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
        .voice-err { font-size: 13px; color: var(--warn); }
        .row { display: flex; gap: 8px; align-items: flex-end; }
        .row textarea {
          flex: 1;
          min-width: 0;
          font-size: 15px;
          line-height: 1.4;
          padding: 9px 12px;
          resize: none;
          max-height: 140px;
          overflow-y: auto;
        }
        .row .btn { padding: 9px 16px; font-size: 15px; }
        .row .mic { padding: 9px 12px; }
        .row .mic.rec {
          color: var(--warn);
          animation: micpulse 1.2s ease-in-out infinite;
        }
        @keyframes micpulse {
          50% { opacity: 0.45; }
        }
      `}</style>
    </div>
  );
}
