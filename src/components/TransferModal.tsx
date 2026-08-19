"use client";

import { formatMinutes } from "@/lib/trip";
import { useTrip } from "@/store/useTrip";

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

const DAY = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });

function day(date: string) {
  return DAY.format(new Date(`${date}T12:00:00`));
}

function time(iso: string) {
  return iso.slice(11, 16);
}

/**
 * Варианты с пересадкой для плеча, на которое сквозных рейсов нет.
 * Каждый вариант — два реальных оффера Туту через хаб; «Собрать» разбивает
 * плечо надвое и проставляет именно их.
 */
export function TransferModal() {
  const transfer = useTrip((s) => s.transfer);
  const legs = useTrip((s) => s.legs);
  const closeTransfer = useTrip((s) => s.closeTransfer);
  const applyTransfer = useTrip((s) => s.applyTransfer);
  // данные подбора живут в legTransfers: их мог заранее собрать автопоиск
  const lt = useTrip((s) => (s.transfer.legId ? s.legTransfers[s.transfer.legId] : undefined));
  if (!transfer.open) return null;

  const leg = legs.find((l) => l.id === transfer.legId);
  const options = lt?.options ?? [];

  return (
    <div className="ovl" onClick={(e) => e.target === e.currentTarget && closeTransfer()}>
      <div className="modal">
        <div className="head">
          <div>
            <h3>Маршрут с пересадкой</h3>
            <p className="sub">
              {leg ? `${leg.from.name} → ${leg.to.name} · ${day(leg.date)}` : ""}
            </p>
          </div>
          <button className="btn" onClick={closeTransfer} aria-label="Закрыть">✕</button>
        </div>

        {lt?.loading && (
          <div className="loading">
            Проверяем хабы: {(lt?.hubsTried ?? ["Москва", "Стамбул", "Дубай"]).join(", ")}…
            <div className="hint">Это два поиска на каждый хаб — до полминуты.</div>
          </div>
        )}

        {lt?.error && <p className="sub err">{lt.error}</p>}

        {!lt?.loading && !lt?.error && options.length === 0 && (
          <p className="sub">
            Через хабы {(lt?.hubsTried ?? []).join(", ")} собрать маршрут не удалось.
            Возможно, дело в названии города — проверьте, как его понял Туту, или сдвиньте дату.
          </p>
        )}

        <div className="list">
          {options.map((o) => (
            <div className="opt" key={o.hub}>
              <div className="r">
                <span className="hub">через {o.hub}</span>
                <span className="price">{fmt(o.totalPrice)}</span>
              </div>
              <div className="s">
                {time(o.first.departureAt)} {leg?.from.name} → {time(o.first.arrivalAt)} {o.hub}
                {" · "}
                {o.first.carriers.join(", ")} · {fmt(o.first.price)}
              </div>
              <div className="s wait">ожидание в {o.hub}: {formatMinutes(o.layoverMin)}</div>
              <div className="s">
                {day(o.secondDate)}, {time(o.second.departureAt)} {o.hub} →{" "}
                {time(o.second.arrivalAt)} {leg?.to.name}
                {" · "}
                {o.second.carriers.join(", ")} · {fmt(o.second.price)}
              </div>
              <div className="act">
                <span className="total">всего в пути {formatMinutes(o.totalMin)}</span>
                <button className="btn primary sm" onClick={() => applyTransfer(o)}>
                  Собрать маршрут
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        .ovl {
          position: fixed;
          inset: 0;
          background: rgba(10, 16, 26, 0.45);
          z-index: 70;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .modal {
          background: var(--panel);
          border-radius: 16px;
          width: min(620px, 100%);
          max-height: 86vh;
          overflow-y: auto;
          box-shadow: var(--shadow);
          padding: 20px 22px;
        }
        .head { display: flex; align-items: flex-start; gap: 12px; }
        .head h3 { font-size: 17px; font-weight: 600; }
        .head .btn { padding: 5px 10px; margin-left: auto; }
        .sub { color: var(--ink-2); font-size: 13px; margin-top: 4px; line-height: 1.5; }
        .sub.err { color: var(--danger); }
        .loading { padding: 22px 0 8px; color: var(--ink-2); font-size: 14px; }
        .hint { font-size: 12px; color: var(--ink-3); margin-top: 4px; }
        .list { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
        .opt {
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 11px 13px;
        }
        .r { display: flex; align-items: baseline; gap: 10px; }
        .hub { font-weight: 600; font-size: 14px; flex: 1; }
        .price { font-weight: 600; font-variant-numeric: tabular-nums; }
        .s { font-size: 12.5px; color: var(--ink-2); margin-top: 4px; }
        .s.wait { color: var(--warn); }
        .act {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: 10px;
        }
        .total { font-size: 12px; color: var(--ink-3); flex: 1; }
        .act :global(.btn.sm) { padding: 5px 13px; font-size: 12.5px; }
      `}</style>
    </div>
  );
}
