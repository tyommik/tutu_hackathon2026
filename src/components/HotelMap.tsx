"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  cityView,
  coreOf,
  countInView,
  fitView,
  metersPerPixel,
  panBy,
  scaleStep,
  TILE_SIZE,
  tileUrl,
  visibleTiles,
  worldPx,
  zoomBy,
  type LatLng,
  type MapView,
} from "@/lib/tiles";
import type { HotelSnapshot } from "@/lib/trip";

const TILES = process.env.NEXT_PUBLIC_TILES_URL;
const TILES_DARK = process.env.NEXT_PUBLIC_TILES_URL_DARK;
const ATTRIBUTION = process.env.NEXT_PUBLIC_TILES_ATTRIBUTION ?? "© MapTiler © OpenStreetMap";
/** Кольца расстояний в схематичном режиме, метры. */
const RINGS = [1000, 3000, 5000];

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

function hasCoords(h: HotelSnapshot): h is HotelSnapshot & LatLng {
  return typeof h.lat === "number" && typeof h.lng === "number";
}

/**
 * Карта отелей рядом с веером вариантов: пины по координатам из MCP,
 * выбор прямо с карты. Подложка — растровые XYZ-тайлы, если задан
 * NEXT_PUBLIC_TILES_URL; иначе схематичный режим с кольцами расстояний
 * (демо не должно зависеть от чужого CDN).
 */
export function HotelMap({
  hotels,
  center,
  nights,
  selectedId,
  hoveredId,
  onHover,
  onChoose,
  onOpenRooms,
  loading,
}: {
  hotels: HotelSnapshot[];
  /** Центр города — для колец расстояний в схематичном режиме. */
  center?: LatLng;
  nights: number;
  selectedId?: string;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onChoose: (h: HotelSnapshot) => void;
  onOpenRooms: (h: HotelSnapshot) => void;
  loading?: boolean;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<MapView | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [tilesBroken, setTilesBroken] = useState(false);
  /** Пользователь сам двигал карту — больше не подстраиваемся под выдачу. */
  const [touched, setTouched] = useState(false);
  const [dark, setDark] = useState(false);
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const failures = useRef(0);

  const pins = hotels.filter(hasCoords);
  const template = (dark && TILES_DARK) || TILES;
  const tiled = Boolean(template) && !tilesBroken;

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const r = e.contentRect;
      setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  // Пока карту не трогали руками, она следует за выдачей: отели приходят
  // порциями и меняются от фильтров. Первый кадр — по плотному ядру, чтобы
  // отель у аэропорта не сжимал центр города в кляксу.
  const pinsKey = pins.map((h) => h.hotelId).join(",");
  useEffect(() => {
    if (touched || size.w === 0 || pins.length === 0) return;
    const byCity = center ? cityView(center, size.w, size.h) : null;
    // если фильтры увели выдачу из центра — показываем то, что нашлось
    const enough = byCity && countInView(pins, byCity, size.w, size.h) >= Math.max(1, pins.length * 0.4);
    setView(enough ? byCity! : fitView(coreOf(pins), size.w, size.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touched, size.w, size.h, pinsKey, center?.lat, center?.lng]);

  const refit = () => {
    if (size.w === 0 || pins.length === 0) return;
    setTouched(true);
    setView(fitView(pins, size.w, size.h));
  };

  const screenOf = (p: LatLng) => {
    if (!view) return null;
    const w = worldPx(p, view.z);
    return { x: w.x - (view.cx - size.w / 2), y: w.y - (view.cy - size.h / 2) };
  };

  const placed = view
    ? pins
        .map((h) => ({ h, p: screenOf(h)! }))
        .filter(({ p }) => p.x > -80 && p.y > -60 && p.x < size.w + 80 && p.y < size.h + 60)
    : [];
  const activeHotel = pins.find((h) => h.hotelId === active) ?? null;
  const activePos = activeHotel ? screenOf(activeHotel) : null;
  const mPerPx = view ? metersPerPixel(center?.lat ?? 0, view.z) : 0;
  const scale = view ? scaleStep(mPerPx) : null;
  const centerPos = center ? screenOf(center) : null;

  return (
    <div className="hmap">
      <div
        className="canvas"
        ref={boxRef}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          drag.current = { x: e.clientX, y: e.clientY, moved: false };
          // захват вешаем на сам элемент под курсором: если взять currentTarget,
          // pointerup уедет на канву и click по пину не долетит до пина
          (e.target as Element).setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current || !(e.buttons & 1) || !view) return;
          const dx = e.clientX - drag.current.x;
          const dy = e.clientY - drag.current.y;
          if (Math.abs(dx) + Math.abs(dy) > 2) {
            drag.current.moved = true;
            setTouched(true);
          }
          drag.current.x = e.clientX;
          drag.current.y = e.clientY;
          setView((v) => (v ? panBy(v, dx, dy, size.h) : v));
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => {
          if (!view) return;
          const r = boxRef.current!.getBoundingClientRect();
          setTouched(true);
          setView(zoomBy(view, e.deltaY > 0 ? -1 : 1, e.clientX - r.left, e.clientY - r.top, size.w, size.h));
        }}
        style={{ cursor: drag.current ? "grabbing" : "grab" }}
      >
        {view && tiled && template && (
          <div className="tiles">
            {visibleTiles(view, size.w, size.h).map((t) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={t.key}
                src={tileUrl(template, t)}
                alt=""
                draggable={false}
                width={TILE_SIZE}
                height={TILE_SIZE}
                style={{ left: t.left, top: t.top }}
                onError={() => {
                  // подложка недоступна — уходим в схематичный режим, а не в серый экран
                  failures.current += 1;
                  if (failures.current > 3) setTilesBroken(true);
                }}
              />
            ))}
          </div>
        )}

        {view && !tiled && centerPos && (
          <svg className="rings" width={size.w} height={size.h} aria-hidden="true">
            {RINGS.map((m) => (
              <g key={m}>
                <circle cx={centerPos.x} cy={centerPos.y} r={m / mPerPx} />
                <text x={centerPos.x} y={centerPos.y - m / mPerPx - 4} textAnchor="middle">
                  {m / 1000} км
                </text>
              </g>
            ))}
            <circle className="dot" cx={centerPos.x} cy={centerPos.y} r={4} />
          </svg>
        )}

        {placed.map(({ h, p }) => {
            const state =
              h.hotelId === selectedId ? " sel" : h.hotelId === hoveredId || h.hotelId === active ? " hl" : "";
            return (
              <button
                key={h.hotelId}
                className={`pin${state}`}
                style={{ left: p.x, top: p.y }}
                title={h.name}
                onPointerEnter={() => onHover(h.hotelId)}
                onPointerLeave={() => onHover(null)}
                onClick={() => {
                  // клик после перетаскивания — это конец жеста, а не выбор
                  if (drag.current?.moved) return;
                  setActive((v) => (v === h.hotelId ? null : h.hotelId));
                }}
              >
                {fmt(h.price)}
              </button>
            );
          })}

        {activeHotel && activePos && (
          <div
            className="card"
            style={{
              left: Math.max(12, Math.min(size.w - 232, activePos.x - 110)),
              top: Math.max(12, activePos.y - 188),
            }}
          >
            {activeHotel.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="ph" src={activeHotel.photo} alt="" />
            ) : (
              <div className="ph empty">фото нет</div>
            )}
            <div className="body">
              <div className="nm">{activeHotel.name}</div>
              <div className="meta">
                {activeHotel.stars ? `${activeHotel.stars}★` : "без звёзд"}
                {activeHotel.rating ? ` · ${activeHotel.rating.toFixed(1)}` : ""}
                {activeHotel.address ? ` · ${activeHotel.address}` : ""}
              </div>
              <div className="meta">
                <b>{fmt(activeHotel.price)}</b> за {nights} ноч. · {fmt(activeHotel.price / nights)}/ночь
              </div>
              <div className="acts">
                <button className="btn sm" onClick={() => onOpenRooms(activeHotel)}>
                  Выбрать номер
                </button>
                <button className="btn primary sm" onClick={() => onChoose(activeHotel)}>
                  Ок
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="top">
          <span className="cnt">
            {loading
              ? "ищем отели…"
              : pins.length === 0
                ? "координат нет"
                : placed.length < pins.length
                  ? `${placed.length} в кадре из ${pins.length}`
                  : `${pins.length} ${pins.length === 1 ? "отель" : "отелей"} на карте`}
            {hotels.length > pins.length ? ` · ${hotels.length - pins.length} без координат` : ""}
          </span>
          <button className="btn sm" onClick={refit} disabled={pins.length === 0}>
            Показать все
          </button>
        </div>

        <div className="ctl">
          <button
            className="btn"
            aria-label="Приблизить"
            onClick={() => view && (setTouched(true), setView(zoomBy(view, 1, size.w / 2, size.h / 2, size.w, size.h)))}
          >
            +
          </button>
          <button
            className="btn"
            aria-label="Отдалить"
            onClick={() => view && (setTouched(true), setView(zoomBy(view, -1, size.w / 2, size.h / 2, size.w, size.h)))}
          >
            −
          </button>
        </div>

        {scale && (
          <div className="scale">
            <span className="bar" style={{ width: scale.px }} />
            {scale.label}
          </div>
        )}
        <div className="attr">{tiled ? ATTRIBUTION : "схематичная карта · координаты Туту"}</div>
      </div>

      <style jsx>{`
        .hmap {
          position: absolute;
          top: 0;
          bottom: 0;
          right: 100%;
          width: min(620px, calc(100vw - var(--panel-w) - 28px));
          margin-right: 10px;
          border-radius: 14px;
          overflow: hidden;
          background: var(--panel-2);
          border: 1px solid var(--line);
          box-shadow: var(--shadow);
        }
        .canvas {
          position: absolute;
          inset: 0;
          overflow: hidden;
          touch-action: none;
          user-select: none;
        }
        .tiles :global(img) {
          position: absolute;
          width: ${TILE_SIZE}px;
          height: ${TILE_SIZE}px;
          pointer-events: none;
        }
        .rings {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }
        .rings :global(circle) {
          fill: none;
          stroke: var(--line-strong);
          stroke-dasharray: 4 6;
        }
        .rings :global(circle.dot) {
          fill: var(--ink-3);
          stroke: none;
        }
        .rings :global(text) {
          fill: var(--ink-3);
          font-size: 10px;
        }
        .pin {
          position: absolute;
          transform: translate(-50%, -50%);
          background: var(--panel);
          border: 1.5px solid var(--line-strong);
          border-radius: 999px;
          padding: 3px 9px;
          font-size: 11.5px;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          white-space: nowrap;
          box-shadow: 0 2px 6px rgba(22, 35, 58, 0.18);
          color: var(--ink);
          z-index: 3;
        }
        .pin.hl {
          border-color: var(--accent);
          color: var(--accent);
          z-index: 5;
        }
        .pin.sel {
          background: var(--accent);
          border-color: var(--accent);
          color: var(--on-accent);
          z-index: 6;
        }
        .card {
          position: absolute;
          width: 220px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
          box-shadow: var(--shadow);
          overflow: hidden;
          z-index: 8;
        }
        .card .ph {
          display: block;
          width: 100%;
          height: 96px;
          object-fit: cover;
        }
        .card .ph.empty {
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--panel-2);
          color: var(--ink-3);
          font-size: 12px;
        }
        .body { padding: 9px 11px 11px; }
        .nm { font-weight: 600; font-size: 13px; }
        .meta { font-size: 11.5px; color: var(--ink-2); margin-top: 3px; }
        .acts { display: flex; gap: 6px; margin-top: 9px; }
        .acts :global(.btn.sm) { padding: 5px 11px; font-size: 12px; }
        .top {
          position: absolute;
          top: 10px;
          left: 10px;
          right: 10px;
          display: flex;
          align-items: center;
          gap: 8px;
          z-index: 7;
        }
        .cnt {
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 4px 9px;
          font-size: 11.5px;
          color: var(--ink-2);
        }
        .top :global(.btn.sm) {
          margin-left: auto;
          padding: 4px 10px;
          font-size: 11.5px;
        }
        .ctl {
          position: absolute;
          right: 10px;
          bottom: 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          z-index: 7;
        }
        .ctl :global(.btn) {
          width: 30px;
          height: 30px;
          padding: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 15px;
        }
        .scale {
          position: absolute;
          left: 10px;
          bottom: 10px;
          font-size: 10.5px;
          color: var(--ink-2);
          background: var(--panel);
          border-radius: 6px;
          padding: 2px 6px;
          display: flex;
          align-items: center;
          gap: 6px;
          z-index: 7;
        }
        .scale .bar {
          height: 3px;
          border: 1px solid var(--ink-3);
          border-top: none;
          display: inline-block;
        }
        .attr {
          position: absolute;
          right: 46px;
          bottom: 12px;
          font-size: 9.5px;
          color: var(--ink-3);
          background: var(--panel);
          border-radius: 5px;
          padding: 1px 5px;
          z-index: 7;
        }
      `}</style>
    </div>
  );
}
