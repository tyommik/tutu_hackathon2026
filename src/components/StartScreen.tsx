"use client";

import { useEffect, useRef, useState } from "react";
import { useVoiceInput } from "./useVoiceInput";
import { useTrip } from "@/store/useTrip";

/**
 * Первый экран: строка запроса и карточки-образцы.
 * Планирование поездки начинается не с формы «откуда-куда-когда», а с фразы
 * в голове — её и просим. Образцы показывают, каким бывает запрос, быстрее
 * любой инструкции: клик отправляет фразу тем же путём, что и своя строка.
 */
const EXAMPLES = [
  {
    emoji: "🇵🇹",
    title: "Португалия и Испания",
    hint: "Порту, Лиссабон, Мадрид, Барселона — в сентябре, вдвоём",
    query:
      "Из Воронежа в Португалию и Испанию в сентябре, вдвоём на две недели: Порту, Лиссабон, Мадрид, Барселона",
  },
  {
    emoji: "⛪",
    title: "Золотое кольцо",
    hint: "классический тур по древним городам",
    query: "Тур по Золотому кольцу из Москвы",
  },
  {
    emoji: "🇧🇷",
    title: "В Бразилию",
    hint: "Рио, Куритиба и водопады Игуасу — втроём, 2 недели в сентябре",
    query:
      "Из Подольска в Бразилию на 2 недели в сентябре, втроём: посетить Рио, Куритибу и водопады Игуасу",
  },
];

export function StartScreen() {
  const start = useTrip((s) => s.start);
  const [text, setText] = useState("");
  // запись/волна/распознавание — общий хук с чатом копилота
  const vo = useVoiceInput((t) => setText((prev) => (prev ? `${prev} ${t}` : t)));
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // высота поля подстраивается под текст: одна строка — капсула,
  // больше — поле растёт вниз, кнопки остаются наверху
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight не включает рамку, а box-sizing: border-box — включает
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
  }, [text]);

  const go = () => start(text);

  return (
    <div className="screen">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/tutu-ai.webp" alt="tutu AI" width={900} height={506} />

      <p className="lead">Опишите поездку словами — соберём маршрут, найдём билеты и отели.</p>

      <div className="box">
        <textarea
          ref={inputRef}
          value={text}
          rows={1}
          autoFocus
          placeholder="Из Воронежа в Португалию в сентябре, вдвоём"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              go();
            }
          }}
          readOnly={vo.voice === "rec"}
          aria-label="Опишите поездку. Shift+Enter — новая строка"
        />
        {vo.voice === "rec" && <canvas ref={vo.canvasRef} className="wave" />}
        {vo.voice === "rec" ? (
          <>
            <button className="micbtn cancel" onClick={vo.cancel} aria-label="Отменить запись" title="Отменить запись">
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
            disabled={vo.voice === "busy"}
            aria-label="Надиктовать голосом"
            title="Надиктовать голосом"
          >
            {vo.voice === "busy" ? "…" : <span className="mic-ico" />}
          </button>
        )}
        <button className="btn primary go" onClick={go}>
          Поехали!
        </button>
      </div>
      {vo.error && <div className="voice-err">{vo.error}</div>}

      <div className="samples">
        {EXAMPLES.map((ex) => (
          <button key={ex.title} className="sample" title={ex.query} onClick={() => start(ex.query)}>
            <span className="emoji" aria-hidden>
              {ex.emoji}
            </span>
            <span className="ttl">{ex.title}</span>
            <span className="hint">{ex.hint}</span>
          </button>
        ))}
      </div>

      <button className="manual" onClick={() => start()}>
        или собрать маршрут вручную
      </button>

      <footer className="credit">
        Выполнил Шибаев Артём для{" "}
        <a href="https://hackathon2026.tutu.ru" target="_blank" rel="noreferrer">
          hackathon2026.tutu.ru
        </a>
      </footer>

      <style jsx>{`
        .screen {
          /* одна ширина у поля и карточек: колонка собрана по общей оси */
          --col-w: min(650px, 100%);
          /* якорь для футера, прибитого к низу экрана */
          position: relative;
          height: 100dvh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 18px;
          padding: 24px;
          /* строка чуть выше геометрического центра — так её читают первой */
          padding-bottom: 12vh;
        }
        .logo {
          display: block;
          width: min(440px, 80vw);
          height: auto;
          /*
           * У картинки белый фон. На светлой теме multiply убирает его без
           * подрезки: белое становится фоном страницы, а сам логотип цел.
           */
          mix-blend-mode: multiply;
        }
        @media (prefers-color-scheme: dark) {
          .logo {
            /* на тёмном multiply съел бы всё — кладём логотип на белую подложку */
            mix-blend-mode: normal;
            background: #fff;
            border-radius: 22px;
            padding: 12px 18px;
            box-shadow: var(--shadow);
          }
        }
        .lead {
          color: var(--ink-2);
          font-size: 15px;
          text-align: center;
          max-width: 520px;
          line-height: 1.5;
        }
        .box {
          position: relative;
          width: var(--col-w);
        }
        .box textarea {
          display: block;
          width: 100%;
          font-size: 16px;
          line-height: 1.45;
          /* справа место под микрофон и «Поехали!», наложенные на поле */
          padding: 15px 178px 15px 20px;
          border-radius: 26px;
          box-shadow: var(--shadow);
          resize: none;
          /* авторост считает высоту сам (см. эффект); выше — свой скролл */
          overflow-y: auto;
          max-height: 38dvh;
        }
        .box textarea:focus {
          outline: none;
          border-color: var(--accent);
        }
        .wave {
          position: absolute;
          top: 2px;
          left: 2px;
          width: calc(100% - 172px);
          height: 49px;
          display: block;
          border-radius: 24px;
          background: var(--panel);
          color: var(--accent);
          pointer-events: none;
        }
        /*
         * Кнопки прибиты к верху поля, а не к центру: при многострочном
         * вводе поле растёт вниз, «Поехали!» и микрофон стоят на месте.
         */
        .box :global(.btn.go) {
          position: absolute;
          top: 6px;
          right: 6px;
          height: 41px;
          padding: 0 24px;
          font-size: 15px;
          border-radius: 999px;
          white-space: nowrap;
        }
        .micbtn {
          position: absolute;
          right: 128px;
          top: 10px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: var(--ink-3);
          font-size: 15px;
        }
        .micbtn:hover { color: var(--accent); background: var(--panel-2); }
        .micbtn.cancel {
          right: 165px;
          color: var(--warn);
        }
        .micbtn.cancel:hover { color: var(--warn); }
        .micbtn.done {
          color: var(--accent);
          font-weight: 600;
          animation: micpulse 1.2s ease-in-out infinite;
        }
        @keyframes micpulse {
          50% { opacity: 0.45; }
        }
        .mic-ico {
          display: block;
          width: 18px;
          height: 18px;
          background: currentColor;
          -webkit-mask: url(/mic.png) center / contain no-repeat;
          mask: url(/mic.png) center / contain no-repeat;
        }
        .voice-err {
          font-size: 13px;
          color: var(--warn);
        }
        .samples {
          display: flex;
          gap: 12px;
          margin-top: 4px;
          /* карточки той же ширины, что и поле: одна колонка, одна ось */
          width: var(--col-w);
        }
        .sample {
          flex: 1 1 0;
          min-width: 0;
          /* квадрат по просьбе из макета; низ — текст, эмодзи уходит вверх */
          aspect-ratio: 1;
          border-radius: 14px;
          background: var(--panel);
          border: 1px solid var(--line);
          box-shadow: var(--shadow);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 7px;
          padding: 16px;
          text-align: left;
          cursor: pointer;
          overflow: hidden;
          transition: transform 0.12s ease, border-color 0.12s ease;
        }
        .sample:hover {
          transform: translateY(-2px);
          border-color: var(--accent);
        }
        .sample .emoji {
          font-size: 30px;
        }
        .sample .ttl {
          font-size: 18px;
          font-weight: 600;
          line-height: 1.25;
        }
        .sample .hint {
          font-size: 15.5px;
          color: var(--ink-2);
          line-height: 1.35;
        }
        /* узкий экран: квадраты в столбик не нужны — пусть станут строками */
        @media (max-width: 640px) {
          .samples { flex-direction: column; }
          .sample { aspect-ratio: auto; }
          .sample .emoji { margin-bottom: 0; }
        }
        .manual {
          font-size: 13px;
          color: var(--ink-3);
          padding: 4px 8px;
        }
        .manual:hover { color: var(--accent); }
        .credit {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 14px;
          text-align: center;
          font-size: 12.5px;
          color: var(--ink-3);
        }
        .credit a {
          color: var(--ink-2);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
        .credit a:hover { color: var(--accent); }
      `}</style>
    </div>
  );
}
