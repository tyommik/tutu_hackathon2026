"use client";

import { useEffect, useState } from "react";
import type { Leg } from "@/lib/trip";
import { useTrip } from "@/store/useTrip";

interface Seat {
  number: string;
  type: string;
  gender?: string;
  position?: { x: number; y: number };
  size?: { width: number; height: number };
}

interface Car {
  car_number: string;
  car_type: string;
  service_class?: string;
  canvas?: { width: number; height: number; svg_url?: string };
  seats: Seat[];
}

const CAR_TYPE: Record<string, string> = {
  RESERVED_SEAT: "плацкарт",
  COMPARTMENT: "купе",
  LUXURY: "СВ",
  SEDENTARY: "сидячий",
  COMMON: "общий",
  SOFT: "люкс",
};

const SEAT_TYPE: Record<string, string> = {
  LOWER: "нижнее",
  UPPER: "верхнее",
  SIDE_LOWER: "нижнее боковое",
  SIDE_UPPER: "верхнее боковое",
  SEDENTARY: "сидячее",
};

async function fetchSeatmap(detailsRef: Record<string, unknown>, carNumber?: string) {
  const res = await fetch("/api/seatmap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ detailsRef, carNumber }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data as { cars: Car[] };
}

export function SeatmapModal({ leg, onClose }: { leg: Leg; onClose: () => void }) {
  const chooseSeat = useTrip((s) => s.chooseSeat);
  const party = useTrip((s) => s.party);
  // мест нужно по числу пассажиров с местом: взрослые + дети от 5 лет
  // (у РЖД дети младше 5 едут без места)
  const seatTarget = Math.max(1, party.adults + party.childrenAges.filter((a) => a >= 5).length);
  const detailsRef = leg.selectedOffer?.detailsRef;
  const [cars, setCars] = useState<Car[] | null>(null);
  const [active, setActive] = useState<Car | null>(null);
  const [picked, setPicked] = useState<string[]>(leg.seatChoice?.seatNumbers ?? []);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!detailsRef) return;
    setLoading(true);
    fetchSeatmap(detailsRef)
      .then((d) => {
        setCars(d.cars);
        const first = leg.seatChoice
          ? d.cars.find((c) => c.car_number === leg.seatChoice!.carNumber) ?? d.cars[0]
          : d.cars[0];
        if (first) selectCar(first.car_number);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectCar = (carNumber: string) => {
    if (!detailsRef) return;
    if (active && active.car_number !== carNumber) setPicked([]);
    setLoading(true);
    setError(null);
    fetchSeatmap(detailsRef, carNumber)
      .then((d) => setActive(d.cars[0] ?? null))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  const canvas = active?.canvas ?? { width: 948, height: 160 };
  const geoSeats = (active?.seats ?? []).filter((s) => s.position && s.size);

  return (
    <div className="ovl" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h3>
          Схема вагона · {leg.from.name} → {leg.to.name}
        </h3>
        <p className="sub">
          Свободные места — из живых данных Туту. Выбранное место уедет в ссылку оформления.
        </p>

        {!detailsRef && <p className="sub err">У этого оффера нет данных схемы (не ж/д?).</p>}
        {error && <p className="sub err">{error}</p>}

        {cars && (
          <div className="tabs">
            {cars.map((c) => (
              <button
                key={c.car_number}
                className={`tab${active?.car_number === c.car_number ? " on" : ""}`}
                onClick={() => selectCar(c.car_number)}
              >
                №{c.car_number} · {CAR_TYPE[c.car_type] ?? c.car_type.toLowerCase()}
              </button>
            ))}
          </div>
        )}

        {loading && <div className="loading">Загружаем схему…</div>}

        {active && !loading && (
          <>
            <div className="mapwrap">
              <svg viewBox={`0 0 ${canvas.width} ${canvas.height}`}>
                <rect
                  x={0}
                  y={0}
                  width={canvas.width}
                  height={canvas.height}
                  rx={14}
                  fill="var(--panel-2)"
                  stroke="var(--line-strong)"
                />
                {canvas.svg_url && (
                  <image
                    href={canvas.svg_url}
                    x={0}
                    y={0}
                    width={canvas.width}
                    height={canvas.height}
                    opacity={0.5}
                  />
                )}
                {geoSeats.map((s) => {
                  const sel = picked.includes(s.number);
                  return (
                    <g
                      key={s.number}
                      onClick={() =>
                        setPicked((prev) => {
                          if (prev.includes(s.number)) return prev.filter((n) => n !== s.number);
                          const next = [...prev, s.number];
                          // при переборе выталкиваем выбранное первым
                          return next.length > seatTarget ? next.slice(1) : next;
                        })
                      }
                      style={{ cursor: "pointer" }}
                    >
                      <rect
                        x={s.position!.x}
                        y={s.position!.y}
                        width={s.size!.width}
                        height={s.size!.height}
                        rx={5}
                        fill={sel ? "var(--accent)" : "var(--rail-soft)"}
                        stroke={sel ? "var(--accent)" : "var(--rail)"}
                        strokeWidth={1.5}
                      />
                      <text
                        x={s.position!.x + s.size!.width / 2}
                        y={s.position!.y + s.size!.height / 2 + 4}
                        textAnchor="middle"
                        fontSize={12}
                        fontWeight={600}
                        fill={sel ? "var(--on-accent)" : "var(--rail)"}
                      >
                        {s.number}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
            <p className="sub">
              Свободно: {geoSeats.length} мест · нужно выбрать: {seatTarget} (по составу)
              {picked.length > 0 &&
                ` · выбрано ${picked.length}/${seatTarget}: ${picked
                  .map((n) => {
                    const t = geoSeats.find((s) => s.number === n)?.type;
                    return `№${n}${t ? ` (${SEAT_TYPE[t] ?? t.toLowerCase()})` : ""}`;
                  })
                  .join(", ")}`}
            </p>
            {picked.length > 0 && picked.length < seatTarget && (
              <p className="sub">
                Выбрано меньше, чем пассажиров — остальным места предложит корзина Туту.
              </p>
            )}
          </>
        )}

        <div className="foot">
          <button className="btn" onClick={onClose}>Отмена</button>
          <button
            className="btn primary"
            disabled={picked.length === 0 || !active}
            onClick={() => {
              if (picked.length > 0 && active) {
                chooseSeat(leg.id, { carNumber: active.car_number, seatNumbers: picked });
                onClose();
              }
            }}
          >
            {seatTarget > 1 ? `Выбрать места (${picked.length}/${seatTarget})` : "Выбрать место"}
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
          width: min(760px, 100%);
          max-height: 86vh;
          overflow-y: auto;
          box-shadow: var(--shadow);
          padding: 22px;
        }
        h3 { font-size: 17px; font-weight: 600; }
        .sub { color: var(--ink-2); font-size: 13px; margin-top: 5px; }
        .sub.err { color: var(--danger); }
        .tabs {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 12px;
        }
        .tab {
          border: 1px solid var(--line-strong);
          border-radius: 8px;
          padding: 6px 11px;
          font-size: 12.5px;
        }
        .tab.on {
          border-color: var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }
        .loading { padding: 30px 0; color: var(--ink-2); }
        .mapwrap {
          margin-top: 14px;
          overflow-x: auto;
          border-radius: 14px;
        }
        .mapwrap svg {
          display: block;
          min-width: 700px;
          width: 100%;
          height: auto;
        }
        .foot {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          margin-top: 16px;
        }
      `}</style>
    </div>
  );
}
