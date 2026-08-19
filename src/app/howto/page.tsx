import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Как пользоваться — Тропа",
  description:
    "Что такое Тропа и как спланировать поездку: маршрут на карте, реальные билеты и отели Туту, оптимизатор и checkout всего маршрута.",
};

/*
 * Серверная страница-инструкция: статичный HTML по /howto, без клиентского
 * кода. Стили — обычным тегом style с префиксом howto-: styled-jsx на
 * сервере недоступен, а у body в приложении overflow: hidden, поэтому
 * скролл — свой, внутри обёртки.
 */

const STEPS = [
  {
    title: "Опишите поездку словами",
    text:
      "На стартовом экране напишите или надиктуйте фразу — «Из Воронежа в Португалию в сентябре, вдвоём». Копилот разберёт её в черновик маршрута. Любите контроль — соберите маршрут вручную, кликами по карте.",
  },
  {
    title: "Маршрут наполняется сам",
    text:
      "Каждое плечо и каждая ночёвка сразу уходят в поиск: система подбирает реальные билеты и отели Туту и подставляет их в план. Бюджет поездки считается в шапке по мере наполнения.",
  },
  {
    title: "Выбирайте варианты",
    text:
      "Клик по плечу или городу открывает веер вариантов: другие рейсы, поезда, автобусы, соседние отели и номера. У поездов можно открыть схему вагона и посмотреть места.",
  },
  {
    title: "Доверьте маршрут оптимизатору",
    text:
      "Кнопка «✦ Оптимизируй» перебирает порядок городов и сдвиги дат и предлагает до трёх вариантов дешевле или быстрее — с точной дельтой по цене и времени.",
  },
  {
    title: "Спросите копилота",
    text:
      "ИИ-копилот комментирует план — стыковки, бюджет, что успеть в городе. Советы помечены как советы ИИ и не подменяют цифры плана: те всегда из живых данных.",
  },
  {
    title: "Checkout всего маршрута",
    text:
      "Одна кнопка пере-проверяет каждое плечо и каждый отель живьём: показывает свежую цену, разницу с планом и отдаёт готовые ссылки на оплату по каждому пункту.",
  },
];

const PERKS = [
  {
    emoji: "🛒",
    title: "Маршрут — корзина, не картинка",
    text: "Каждый пункт плана — реальное покупаемое предложение Туту, а не строчка в блокноте.",
  },
  {
    emoji: "♻️",
    title: "План не устаревает",
    text: "Checkout ре-валидирует весь маршрут перед оплатой: цены и наличие проверяются в момент клика.",
  },
  {
    emoji: "🚆",
    title: "Мультитранспорт",
    text: "Самолёты, поезда, электрички и автобусы в одном поиске — система сама предлагает, чем ехать плечо.",
  },
  {
    emoji: "🛏",
    title: "Ночёвки считаются сами",
    text: "Отели и число ночей выводятся из дат маршрута: сдвинули плечо — ночёвки пересчитались.",
  },
  {
    emoji: "💰",
    title: "Честный бюджет",
    text: "Вся поездка суммируется в рублях по курсу ЦБ — видно, во сколько обойдётся маршрут целиком.",
  },
  {
    emoji: "🔓",
    title: "Без регистрации и ключей",
    text: "Планирование работает сразу: ничего не нужно заводить, оплата — по ссылкам на Туту.",
  },
];

export default function HowtoPage() {
  return (
    <div className="howto-screen">
      <main className="howto-page">
        <header className="howto-head">
          <h1>Тропа</h1>
          <p className="howto-lead">
            Конструктор планирования путешествий на основе Tutu&nbsp;MCP. Вы собираете поездку по
            кирпичикам на карте — система наполняет её реальными билетами и отелями Туту. В конце
            один checkout пере-проверяет весь маршрут и отдаёт свежие ссылки на оплату.
          </p>
          <Link className="howto-cta" href="/">
            Открыть Тропу →
          </Link>
        </header>

        <section aria-labelledby="howto-steps">
          <h2 id="howto-steps">Как пользоваться</h2>
          <ol className="howto-list">
            {STEPS.map((s, i) => (
              <li key={s.title} className="howto-step">
                <span className="howto-num" aria-hidden>
                  {i + 1}
                </span>
                <div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="howto-perks">
          <h2 id="howto-perks">Преимущества</h2>
          <ul className="howto-grid">
            {PERKS.map((p) => (
              <li key={p.title} className="howto-perk">
                <span className="howto-emoji" aria-hidden>
                  {p.emoji}
                </span>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <footer className="howto-foot">
          <Link className="howto-cta" href="/">
            Спланировать поездку →
          </Link>
        </footer>
      </main>

      <style>{`
        /* у body приложения overflow: hidden — скролл живёт в этой обёртке */
        .howto-screen {
          height: 100dvh;
          overflow-y: auto;
          background: var(--bg);
        }
        .howto-page {
          max-width: 760px;
          margin: 0 auto;
          padding: 40px 24px 64px;
          display: flex;
          flex-direction: column;
          gap: 36px;
        }
        .howto-head h1 {
          font-size: 34px;
          font-weight: 700;
          letter-spacing: -0.01em;
        }
        .howto-lead {
          margin-top: 10px;
          font-size: 16px;
          line-height: 1.55;
          color: var(--ink-2);
          max-width: 620px;
        }
        .howto-cta {
          display: inline-block;
          margin-top: 18px;
          padding: 10px 22px;
          border-radius: 999px;
          background: var(--accent);
          color: var(--on-accent);
          font-weight: 500;
          text-decoration: none;
        }
        .howto-cta:hover {
          filter: brightness(1.08);
        }
        .howto-page h2 {
          font-size: 21px;
          font-weight: 650;
          margin-bottom: 16px;
        }
        .howto-list {
          list-style: none;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .howto-step {
          display: flex;
          gap: 14px;
          padding: 16px 18px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
        }
        .howto-num {
          flex: none;
          width: 28px;
          height: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
          font-size: 14px;
        }
        .howto-step h3,
        .howto-perk h3 {
          font-size: 15.5px;
          font-weight: 600;
          margin-bottom: 3px;
        }
        .howto-step p,
        .howto-perk p {
          font-size: 14px;
          line-height: 1.5;
          color: var(--ink-2);
        }
        .howto-grid {
          list-style: none;
          padding: 0;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .howto-perk {
          padding: 16px 18px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 14px;
        }
        .howto-emoji {
          display: block;
          font-size: 24px;
          margin-bottom: 8px;
        }
        .howto-foot {
          text-align: center;
        }
        @media (max-width: 560px) {
          .howto-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
