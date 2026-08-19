"use client";

import { useTrip } from "@/store/useTrip";

function fmt(n: number) {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) + " ₽";
}

export function CheckoutModal() {
  const { checkout, closeCheckout } = useTrip();
  if (!checkout.open) return null;
  const r = checkout.result;

  return (
    <div className="ovl" onClick={(e) => e.target === e.currentTarget && closeCheckout()}>
      <div className="modal">
        <h3>Checkout всего маршрута</h3>
        <p className="sub">
          Каждое плечо и отель пере-проверены живыми запросами к Туту — цены свежие, план не устарел.
        </p>

        {checkout.loading && <div className="loading">Пере-проверяем маршрут живьём…</div>}

        {r && (
          <>
            <div className="rows">
              {r.items.map((i) => (
                <div key={i.id} className="row">
                  <span className="st">{i.kind === "extra" ? "₽" : i.error ? "✕" : "✓"}</span>
                  <span className="nm">{i.label}</span>
                  {/* «актуально» значит «Туту перепроверил» — про свою трату так сказать нельзя */}
                  {i.kind === "extra" ? (
                    <span className="df own">своя трата</span>
                  ) : i.error ? (
                    <span className="df err">{i.error}</span>
                  ) : i.diff && i.diff !== 0 ? (
                    <span className={`df ${i.diff > 0 ? "up" : "dn"}`}>
                      {i.diff > 0 ? "+" : "−"}{fmt(Math.abs(i.diff))}
                    </span>
                  ) : (
                    <span className="df eq">актуально</span>
                  )}
                </div>
              ))}
            </div>

            <div className="total">
              <span>Итог со свежими ценами</span>
              <b>{fmt(r.freshTotal)}</b>
            </div>
            {r.diff !== 0 && (
              <div className="sub">
                Изменение за время планирования: {r.diff > 0 ? "+" : "−"}{fmt(Math.abs(r.diff))}
              </div>
            )}

            <div className="links">
              {r.items.filter((i) => i.checkoutUrl).map((i) => (
                <a key={i.id} href={i.checkoutUrl} target="_blank" rel="noopener noreferrer">
                  → Оформить: {i.label} {i.freshPrice !== undefined && `(${fmt(i.freshPrice)})`}
                </a>
              ))}
            </div>
          </>
        )}

        <div className="foot">
          <button className="btn" onClick={closeCheckout}>Готово</button>
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
          width: min(480px, 100%);
          max-height: 84vh;
          overflow-y: auto;
          box-shadow: var(--shadow);
          padding: 22px;
        }
        h3 { font-size: 17px; font-weight: 600; }
        .sub { color: var(--ink-2); font-size: 13px; margin-top: 4px; }
        .loading { padding: 24px 0; color: var(--ink-2); }
        .rows { margin-top: 12px; }
        .row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 2px;
          border-bottom: 1px solid var(--line);
          font-size: 13px;
        }
        .row:last-child { border-bottom: none; }
        .st { width: 16px; color: var(--ok); }
        .nm { flex: 1; }
        .df { font-variant-numeric: tabular-nums; font-size: 12.5px; font-weight: 600; }
        .df.up { color: var(--danger); }
        .df.dn { color: var(--ok); }
        .df.eq { color: var(--ink-3); font-weight: 400; }
        .df.own { color: var(--bus); font-weight: 400; }
        .df.err { color: var(--danger); font-weight: 400; max-width: 170px; text-align: right; }
        .total {
          border-top: 1px solid var(--line);
          margin-top: 12px;
          padding-top: 12px;
          display: flex;
          justify-content: space-between;
          align-items: baseline;
        }
        .total b { font-size: 19px; font-variant-numeric: tabular-nums; }
        .links {
          display: flex;
          flex-direction: column;
          gap: 9px;
          margin-top: 14px;
        }
        .links a {
          font-size: 12.5px;
          color: var(--accent);
          text-decoration: none;
          font-weight: 500;
        }
        .links a:hover { text-decoration: underline; }
        .foot { display: flex; justify-content: flex-end; margin-top: 16px; }
      `}</style>
    </div>
  );
}
