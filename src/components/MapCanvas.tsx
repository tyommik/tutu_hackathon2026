"use client";

import { useCallback, useRef, useState } from "react";
import { LAND_D } from "@/lib/land";
import { legPathD, project, VB } from "@/lib/geo";
import { cityOf } from "@/lib/aviaFilters";
import { cityId, stayKey, type Leg, type Stay } from "@/lib/trip";
import { resolveCoords } from "@/lib/cities";
import { useTrip } from "@/store/useTrip";

const MODE_COLOR: Record<string, string> = {
  avia: "var(--avia)",
  rail: "var(--rail)",
  bus: "var(--bus)",
  etrain: "var(--rail)",
  any: "var(--ink-3)",
};

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function MapCanvas({
  hoveredLeg,
  onHover,
  hoveredStay,
  onHoverStay,
  onOpenStay,
}: {
  hoveredLeg: string | null;
  onHover: (id: string | null) => void;
  hoveredStay: string | null;
  onHoverStay: (key: string | null) => void;
  onOpenStay: (stay: Stay) => void;
}) {
  const legs = useTrip((s) => s.legs);
  const stays = useTrip((s) => s.stays);
  const origin = useTrip((s) => s.origin);
  const legStatus = useTrip((s) => s.legStatus);
  const coordsCache = useTrip((s) => s.coords);

  /** Координаты города: свои поля → справочник/хабы → кэш с сервера. */
  const coordsOf = (c: { name: string; lat?: number; lng?: number }) => {
    if (c.lat !== undefined && c.lng !== undefined) return { lat: c.lat, lng: c.lng };
    return resolveCoords(c.name) ?? coordsCache[c.name];
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, w: VB.W, h: VB.H });
  const drag = useRef<{ x: number; y: number } | null>(null);
  /**
   * Точка нажатия и признак протаскивания. Карту тащат, взявшись за любое
   * место, в том числе за метку города, — и после такого протаскивания
   * браузер всё равно шлёт click. Без этого порога каждая попытка
   * подвинуть карту от города открывала бы веер отелей.
   */
  const down = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  const zoomAt = useCallback((k: number, cx?: number, cy?: number) => {
    setView((v) => {
      const nw = Math.min(2400, Math.max(200, v.w * k));
      const real = nw / v.w;
      const px = cx ?? v.x + v.w / 2;
      const py = cy ?? v.y + v.h / 2;
      return {
        x: px - (px - v.x) * real,
        y: py - (py - v.y) * real,
        w: nw,
        h: v.h * real,
      };
    });
  }, []);

  const toSvg = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    return pt.matrixTransform(svg.getScreenCTM()!.inverse());
  };

  const cities = new Map<string, { name: string; lat?: number; lng?: number }>();
  // начальная точка видна на карте ещё до появления первого плеча
  if (origin) cities.set(cityId(origin.city), origin.city);
  for (const l of legs) {
    cities.set(cityId(l.from), l.from);
    cities.set(cityId(l.to), l.to);
  }
  // маркер города на карте один, поэтому и ночёвка берётся первая:
  // при возврате в тот же город веер откроется для первой из них
  const stayByCity = new Map<string, Stay>();
  for (const st of stays) {
    const id = cityId(st.city);
    if (!stayByCity.has(id)) stayByCity.set(id, st);
  }

  return (
    <div className="map-wrap">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        aria-label="Карта маршрута"
        onWheel={(e) => {
          const p = toSvg(e);
          zoomAt(e.deltaY > 0 ? 1.18 : 1 / 1.18, p.x, p.y);
        }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY };
          down.current = { x: e.clientX, y: e.clientY };
          moved.current = false;
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current || !(e.buttons & 1)) {
            drag.current = null;
            return;
          }
          if (down.current) {
            const off =
              Math.abs(e.clientX - down.current.x) + Math.abs(e.clientY - down.current.y);
            if (off > 4) moved.current = true;
          }
          const ctm = svgRef.current!.getScreenCTM()!;
          const dx = (e.clientX - drag.current.x) / ctm.a;
          const dy = (e.clientY - drag.current.y) / ctm.d;
          drag.current = { x: e.clientX, y: e.clientY };
          setView((v) => ({ ...v, x: v.x - dx, y: v.y - dy }));
        }}
        onPointerUp={() => (drag.current = null)}
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
      >
        <path d={LAND_D} fill="var(--land)" stroke="var(--line-strong)" strokeWidth={0.6} opacity={0.9} />

        {legs.map((l) => {
          const fromC = coordsOf(l.from);
          const toC = coordsOf(l.to);
          // координаты ещё не догрузились — плечо появится на карте следом
          if (!fromC || !toC) return null;
          const a = project(fromC.lat, fromC.lng);
          const b = project(toC.lat, toC.lng);
          const mode = l.selectedOffer?.mode ?? l.mode;
          const searching = !l.selectedOffer && legStatus[l.id] === "loading";

          // пересадки составного рейса: ведём линию через точки пересадок
          const transferPts: Array<{ x: number; y: number; name: string }> = [];
          const segs = l.selectedOffer?.segments ?? [];
          for (let i = 0; i < segs.length - 1; i++) {
            const name = cityOf(segs[i].to);
            const c = resolveCoords(name) ?? coordsCache[name];
            if (c) transferPts.push({ ...project(c.lat, c.lng), name });
          }
          const chain = [a, ...transferPts, b];
          const d =
            chain.length > 2
              ? chain.slice(0, -1).map((p, i) => legPathD(p, chain[i + 1], mode)).join(" ")
              : legPathD(a, b, mode);
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 - (mode === "avia" ? 16 : 8) };
          return (
            <g key={l.id}>
              <path
                d={d}
                fill="none"
                className={searching ? "searching" : undefined}
                stroke={searching ? "var(--accent)" : MODE_COLOR[mode]}
                strokeWidth={hoveredLeg === l.id ? 4.4 : 2.4}
                strokeDasharray={
                  searching ? "4 8" : mode === "bus" ? "7 5" : l.selectedOffer ? undefined : "3 5"
                }
              />
              {transferPts.map((p) => (
                <g key={p.name}>
                  <circle cx={p.x} cy={p.y} r={4} fill="var(--panel)" stroke={MODE_COLOR[mode]} strokeWidth={1.8} />
                  <text x={p.x + 8} y={p.y - 6} fontSize={10} fill="var(--ink-3)">
                    {p.name}
                  </text>
                </g>
              ))}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={16}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => onHover(l.id)}
                onPointerLeave={() => onHover(null)}
              />
              {l.selectedOffer && (
                <text x={mid.x} y={mid.y} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="var(--ink-2)">
                  {fmt(l.selectedOffer.price)}
                </text>
              )}
            </g>
          );
        })}

        {[...cities.entries()].map(([id, c]) => {
          const cc = coordsOf(c);
          if (!cc) return null;
          const p = project(cc.lat, cc.lng);
          const st = stayByCity.get(id);
          const right = p.x > VB.W * 0.78;
          const hot = !!st && hoveredStay === stayKey(st);
          const hotel = st?.selectedHotel;
          return (
            <g
              key={id}
              // города без ночёвки остаются частью карты, а не кнопкой:
              // отель там выбирать нечего
              style={st ? { cursor: "pointer" } : undefined}
              onPointerEnter={st ? () => onHoverStay(stayKey(st)) : undefined}
              onPointerLeave={st ? () => onHoverStay(null) : undefined}
              onClick={
                st
                  ? () => {
                      if (!moved.current) onOpenStay(st);
                    }
                  : undefined
              }
            >
              {/* точка радиусом 7 — мелкая цель для мыши: расширяем прозрачным кругом */}
              {st && <circle cx={p.x} cy={p.y} r={15} fill="transparent" />}
              {hot && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12}
                  fill="none"
                  stroke="var(--hotel)"
                  strokeWidth={1.6}
                  opacity={0.5}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={st ? (hot ? 9 : 7) : 5.5}
                fill={st ? "var(--hotel)" : "var(--ink-2)"}
                stroke="var(--panel)"
                strokeWidth={2}
              />
              <text
                x={right ? p.x - 12 : p.x + 12}
                y={p.y + 4}
                textAnchor={right ? "end" : "start"}
                fontSize={11.5}
                fontWeight={600}
                fill={st ? "var(--ink)" : "var(--ink-2)"}
              >
                {c.name}
              </text>
              {hot && (
                <text
                  x={right ? p.x - 12 : p.x + 12}
                  y={p.y + 17}
                  textAnchor={right ? "end" : "start"}
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--hotel)"
                >
                  {hotel ? `${hotel.name} · ${fmt(hotel.price)}` : "выбрать отель"}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <div className="zoomctl">
        <button className="btn" aria-label="Приблизить" onClick={() => zoomAt(1 / 1.35)}>+</button>
        <button className="btn" aria-label="Отдалить" onClick={() => zoomAt(1.35)}>−</button>
        <button className="btn" aria-label="Весь маршрут" onClick={() => setView({ x: 0, y: 0, w: VB.W, h: VB.H })}>⌂</button>
      </div>

      <style jsx>{`
        .map-wrap {
          position: absolute;
          inset: 0 var(--panel-gap) 0 0;
          /* --panel-gap меняется, когда план сворачивают: едем вместе с ним */
          transition: inset 0.22s ease;
        }
        svg {
          width: 100%;
          height: 100%;
          touch-action: none;
          user-select: none;
        }
        svg :global(path.searching) {
          animation: dashrun 0.7s linear infinite;
        }
        @keyframes dashrun {
          to { stroke-dashoffset: -24; }
        }
        .zoomctl {
          position: absolute;
          right: 14px;
          bottom: 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .zoomctl :global(.btn) {
          width: 36px;
          height: 36px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 17px;
          box-shadow: var(--shadow);
        }
      `}</style>
    </div>
  );
}
