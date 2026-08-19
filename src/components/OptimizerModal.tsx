"use client";

import { useTrip } from "@/store/useTrip";

function fmt(n: number) {
  return Math.round(Math.abs(n)).toLocaleString("ru-RU") + " ₽";
}

function fmtMin(n: number) {
  const h = Math.floor(Math.abs(n) / 60);
  const m = Math.abs(n) % 60;
  return h ? `${h} ч ${m ? m + " мин" : ""}`.trim() : `${m} мин`;
}

export function OptimizerModal() {
  const { optimizer, closeOptimizer, applySuggestion } = useTrip();
  if (!optimizer.open) return null;
  const r = optimizer.result;

  return (
    <div className="ovl" onClick={(e) => e.target === e.currentTarget && closeOptimizer()}>
      <div className="modal">
        <h3>✦ Оптимизатор маршрута</h3>

        {optimizer.loading && (
          <>
            <p className="sub">
              Перебираем перестановки городов и сдвиги дат, цены — из кэша поисков и живых запросов к Туту…
            </p>
            <div className="bar"><i /></div>
          </>
        )}

        {r?.error && <p className="sub err">{r.error}</p>}

        {r && !r.error && (
          <>
            <p className="sub">
              Перебрано {r.combinations} комбинаций ({r.uniqueSearches} уникальных поисков,{" "}
              {(r.tookMs / 1000).toFixed(1)} с).
            </p>

            {r.suggestions.length === 0 ? (
              <div className="res">
                <div className="d">Ваш план уже оптимален</div>
                <p>
                  Ни одна перестановка городов и ни один сдвиг дат не дают выигрыша по цене и времени
                  в пути.
                </p>
              </div>
            ) : (
              r.suggestions.map((s) => (
                <div className="res" key={s.label}>
                  <div className="d">
                    {s.label.charAt(0).toUpperCase() + s.label.slice(1)}{" "}
                    <span className="save">
                      {s.deltaPrice < 0 && `−${fmt(s.deltaPrice)}`}
                      {s.deltaPrice < 0 && s.deltaMinutes < 0 && " и "}
                      {s.deltaMinutes < 0 && `−${fmtMin(s.deltaMinutes)} в пути`}
                      {s.deltaPrice >= 0 && s.deltaMinutes >= 0 && "выгоднее по скору"}
                    </span>
                  </div>
                  <p>
                    Новый порядок: {s.legs.map((l) => l.from.name).join(" → ")} →{" "}
                    {s.legs[s.legs.length - 1].to.name}. Итог ≈ {fmt(s.price)}
                    {s.deltaPrice > 0 && ` (+${fmt(s.deltaPrice)}, зато −${fmtMin(s.deltaMinutes)})`}.
                  </p>
                  <div className="acts">
                    <button className="btn primary" onClick={() => applySuggestion(s)}>
                      Применить
                    </button>
                  </div>
                </div>
              ))
            )}
          </>
        )}

        <div className="foot">
          <button className="btn" onClick={closeOptimizer}>
            {r?.suggestions.length ? "Оставить как есть" : "Закрыть"}
          </button>
        </div>
      </div>

      <style jsx>{`
        .ovl {
          position: fixed;
          inset: 0;
          background: rgba(10, 16, 26, 0.45);
          z-index: 60;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal {
          background: var(--panel);
          border-radius: 16px;
          width: min(500px, 100%);
          max-height: 84vh;
          overflow-y: auto;
          box-shadow: var(--shadow);
          padding: 22px;
        }
        h3 { font-size: 17px; font-weight: 600; }
        .sub { color: var(--ink-2); font-size: 13px; margin-top: 6px; }
        .sub.err { color: var(--danger); }
        .bar {
          height: 5px;
          border-radius: 99px;
          background: var(--line);
          overflow: hidden;
          margin-top: 16px;
        }
        .bar i {
          display: block;
          height: 100%;
          width: 40%;
          background: var(--accent);
          border-radius: 99px;
          animation: slide 1.2s ease-in-out infinite;
        }
        @keyframes slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        .res {
          border: 1px solid var(--line);
          border-radius: 11px;
          padding: 13px 14px;
          margin-top: 12px;
        }
        .res .d { font-weight: 600; font-size: 14px; }
        .res p { font-size: 12.5px; color: var(--ink-2); margin-top: 5px; }
        .save { color: var(--ok); font-weight: 600; }
        .acts { display: flex; justify-content: flex-end; margin-top: 10px; }
        .foot { display: flex; justify-content: flex-end; margin-top: 14px; }
      `}</style>
    </div>
  );
}
