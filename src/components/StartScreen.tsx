"use client";

import { useState } from "react";
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
    query: "Тур по Золотому кольцу",
  },
  {
    emoji: "🌉",
    title: "В Бостон",
    hint: "из Подольска, 26 сентября, втроём",
    query: "Из Подольска в Бостон на 26 сентября втроём",
  },
];

export function StartScreen() {
  const start = useTrip((s) => s.start);
  const [text, setText] = useState("");

  const go = () => start(text);

  return (
    <div className="screen">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="logo" src="/tutu-ai.webp" alt="tutu AI" width={900} height={506} />

      <p className="lead">Опишите поездку словами — соберём маршрут, найдём билеты и отели.</p>

      <div className="box">
        <input
          value={text}
          autoFocus
          placeholder="Из Воронежа в Португалию через Стамбул в сентябре, вдвоём"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && go()}
          aria-label="Опишите поездку"
        />
        <button className="btn primary" onClick={go}>
          Поехали!
        </button>
      </div>

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

      <style jsx>{`
        .screen {
          /* ширина кнопки задана явно: от неё считается сдвиг пары */
          --go-w: 132px;
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
          display: flex;
          gap: 10px;
          width: min(680px, 100%);
          /*
           * Главная ось экрана — центр поля ввода, а не центр пары
           * «поле + кнопка». Поэтому сдвигаем пару вправо ровно на кнопку:
           * марка, подсказка и ссылка внизу встают с полем на одну линию.
           */
          margin-left: calc(var(--go-w) + 10px);
        }
        .box input {
          flex: 1;
          min-width: 0;
          font-size: 16px;
          padding: 14px 18px;
          border-radius: 999px;
          box-shadow: var(--shadow);
        }
        .box input:focus {
          outline: none;
          border-color: var(--accent);
        }
        .box :global(.btn) {
          width: var(--go-w);
          flex: none;
          padding: 0;
          font-size: 15px;
          border-radius: 999px;
          white-space: nowrap;
        }
        /* узкий экран: пара уже не помещается со сдвигом — центрируем как есть */
        @media (max-width: 900px) {
          .box { margin-left: 0; }
        }
        .samples {
          display: flex;
          gap: 12px;
          margin-top: 4px;
        }
        .sample {
          width: 172px;
          /* квадрат по просьбе из макета; низ — текст, эмодзи уходит вверх */
          aspect-ratio: 1;
          border-radius: 14px;
          background: var(--panel);
          border: 1px solid var(--line);
          box-shadow: var(--shadow);
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-end;
          gap: 5px;
          padding: 14px;
          text-align: left;
          cursor: pointer;
          transition: transform 0.12s ease, border-color 0.12s ease;
        }
        .sample:hover {
          transform: translateY(-2px);
          border-color: var(--accent);
        }
        .sample .emoji {
          font-size: 30px;
          margin-bottom: auto;
        }
        .sample .ttl {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.25;
        }
        .sample .hint {
          font-size: 11.5px;
          color: var(--ink-2);
          line-height: 1.35;
        }
        /* узкий экран: квадраты в столбик не нужны — пусть станут строками */
        @media (max-width: 640px) {
          .samples { flex-direction: column; width: min(680px, 100%); }
          .sample { width: 100%; aspect-ratio: auto; }
          .sample .emoji { margin-bottom: 0; }
        }
        .manual {
          font-size: 13px;
          color: var(--ink-3);
          padding: 4px 8px;
        }
        .manual:hover { color: var(--accent); }
      `}</style>
    </div>
  );
}
