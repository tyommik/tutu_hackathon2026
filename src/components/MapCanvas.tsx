"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LAND_D } from "@/lib/land";
import { fitRect, HOME, legPathD, priceLabelPos, project, svgTiles, VB, WORLD } from "@/lib/geo";
import { tileUrl } from "@/lib/tiles";
import { cityOf } from "@/lib/aviaFilters";
import { cityId, stayKey, type HotelSnapshot, type Leg, type Stay } from "@/lib/trip";
import { resolveCoords } from "@/lib/cities";
import { useTrip } from "@/store/useTrip";

const TILES = process.env.NEXT_PUBLIC_TILES_URL;
const TILES_DARK = process.env.NEXT_PUBLIC_TILES_URL_DARK;
const ATTRIBUTION = process.env.NEXT_PUBLIC_TILES_ATTRIBUTION ?? "© MapTiler © OpenStreetMap";

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
  onOpenRooms,
  onHotelChosen,
}: {
  hoveredLeg: string | null;
  onHover: (id: string | null) => void;
  hoveredStay: string | null;
  onHoverStay: (key: string | null) => void;
  onOpenStay: (stay: Stay) => void;
  onOpenRooms: (hotel: HotelSnapshot, stay: Stay) => void;
  /** Отель выбран с карты — веер отелей пора закрыть. */
  onHotelChosen: () => void;
}) {
  const legs = useTrip((s) => s.legs);
  const stays = useTrip((s) => s.stays);
  const origin = useTrip((s) => s.origin);
  const legStatus = useTrip((s) => s.legStatus);
  const coordsCache = useTrip((s) => s.coords);
  const pick = useTrip((s) => s.hotelPick);
  const chooseHotel = useTrip((s) => s.chooseHotel);

  /** Координаты города: свои поля → справочник/хабы → кэш с сервера. */
  const coordsOf = (c: { name: string; lat?: number; lng?: number }) => {
    if (c.lat !== undefined && c.lng !== undefined) return { lat: c.lat, lng: c.lng };
    return resolveCoords(c.name) ?? coordsCache[c.name];
  };
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<View>({ ...HOME });
  const drag = useRef<{ x: number; y: number } | null>(null);
  /**
   * Точка нажатия и признак протаскивания. Карту тащат, взявшись за любое
   * место, в том числе за метку города, — и после такого протаскивания
   * браузер всё равно шлёт click. Без этого порога каждая попытка
   * подвинуть карту от города открывала бы веер отелей.
   */
  const down = useRef<{ x: number; y: number } | null>(null);
  const moved = useRef(false);

  /**
   * Подложка: реальные тайлы MapTiler или схематичный контур. Тайлы — только
   * при заданном NEXT_PUBLIC_TILES_URL; выбор пользователя переживает
   * перезагрузку, а без сети схема остаётся полноценным режимом.
   */
  const [tiled, setTiled] = useState(false);
  const [dark, setDark] = useState(false);
  /**
   * Фактический размер окна карты. Вид обязан держать ЕГО соотношение
   * сторон: иначе SVG вписывает viewBox с полосами сверху и снизу — на
   * схеме их не было видно, а тайловая подложка обнажила.
   */
  const [screen, setScreen] = useState({ w: 1200, h: 744 });
  const aspectRef = useRef(screen.h / screen.w);
  aspectRef.current = screen.h / screen.w;
  useEffect(() => {
    if (TILES) setTiled(localStorage.getItem("tropa.mapTiles") !== "off");
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setDark(mq.matches);
    const onMq = (e: MediaQueryListEvent) => setDark(e.matches);
    mq.addEventListener("change", onMq);
    const measure = () => {
      const el = svgRef.current;
      if (el && el.clientWidth > 0 && el.clientHeight > 0) {
        setScreen({ w: el.clientWidth, h: el.clientHeight });
      }
    };
    measure();
    // ResizeObserver, а не resize окна: ширина карты меняется и от
    // сворачивания плана (--panel-gap), окно при этом не трогается
    const ro = new ResizeObserver(measure);
    if (svgRef.current) ro.observe(svgRef.current);
    return () => {
      mq.removeEventListener("change", onMq);
      ro.disconnect();
    };
  }, []);
  // окно изменилось — вид перенимает его пропорцию, верхний край на месте
  useEffect(() => {
    setView((v) => ({ ...v, h: v.w * (screen.h / screen.w) }));
  }, [screen]);
  const tileTemplate = (dark && TILES_DARK) || TILES;
  const showTiles = tiled && !!tileTemplate;

  /** Карточка отеля у точки клика по пину (координаты внутри .map-wrap). */
  const [card, setCard] = useState<{ hotel: HotelSnapshot; x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // животрепещущие значения для колбэков анимации и эффекта выбора отеля
  const viewRef = useRef(view);
  viewRef.current = view;
  const tiledRef = useRef(tiled);
  tiledRef.current = tiled;

  /**
   * Плавный перелёт вида. Ширина интерполируется в лог-пространстве:
   * зум «регион → квартал» линейной интерполяцией схлопывается рывком
   * в первом кадре и дальше еле ползёт.
   */
  const animRef = useRef(0);
  const animateTo = useCallback((target: View) => {
    cancelAnimationFrame(animRef.current);
    const from = { ...viewRef.current };
    const start = performance.now();
    const DUR = 550;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DUR);
      const e = 1 - (1 - t) ** 3;
      const w = from.w * (target.w / from.w) ** e;
      const h = from.h * (target.h / from.h) ** e;
      const cx = from.x + from.w / 2 + (target.x + target.w / 2 - (from.x + from.w / 2)) * e;
      const cy = from.y + from.h / 2 + (target.y + target.h / 2 - (from.y + from.h / 2)) * e;
      setView({ x: cx - w / 2, y: cy - h / 2, w, h });
      if (t < 1) animRef.current = requestAnimationFrame(step);
    };
    animRef.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(animRef.current), []);

  /**
   * Вход и выход из выбора отеля: карта запоминает вид, летит к пинам
   * (на схеме городской зум пуст — тайлы включаются сами), а после выбора
   * или закрытия веера возвращает всё как было.
   */
  const savedView = useRef<View | null>(null);
  const savedTiled = useRef<boolean | null>(null);
  const pickSig = pick ? `${pick.key}:${pick.hotels.map((h) => h.hotelId).join(",")}` : null;
  useEffect(() => {
    setCard(null);
    if (pick) {
      const pts = pick.hotels
        .filter((h) => h.lat !== undefined && h.lng !== undefined)
        .map((h) => project(h.lat!, h.lng!));
      const target = fitRect(pts, aspectRef.current);
      if (!target) return;
      if (savedView.current === null) {
        savedView.current = { ...viewRef.current };
        savedTiled.current = tiledRef.current;
        if (TILES && !tiledRef.current) setTiled(true);
      }
      animateTo(target);
    } else if (savedView.current) {
      animateTo(savedView.current);
      savedView.current = null;
      if (savedTiled.current === false) setTiled(false);
      savedTiled.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickSig]);

  const zoomAt = useCallback((k: number, cx?: number, cy?: number) => {
    // карточка отеля прибита к экранной точке клика — при смене вида врёт
    setCard((c) => (c ? null : c));
    setView((v) => {
      // от целого мира до городского квартала: подписи держат экранный
      // размер, так что глубокий зум разводит и города, и пины отелей
      const nw = Math.min(WORLD, Math.max(0.1, v.w * k));
      const real = nw / v.w;
      // высота — всегда из пропорции окна, иначе SVG рисует полосы
      const nh = nw * aspectRef.current;
      const px = cx ?? v.x + v.w / 2;
      const py = cy ?? v.y + v.h / 2;
      return {
        x: px - (px - v.x) * real,
        y: py - (py - v.y) * (nh / v.h),
        w: nw,
        h: nh,
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

  /**
   * Экранный масштаб: зум сужает viewBox, и всё нарисованное растёт как
   * картинка. Подписи, точки и толщины линий — экранные величины: домножаем
   * их на s, чтобы при приближении они держали постоянный размер на экране
   * и расходились вместе с городами, а не накладывались как прежде.
   */
  const s = view.w / VB.W;

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

  const pickStay = pick ? stays.find((st) => stayKey(st) === pick.key) : undefined;

  return (
    <div className="map-wrap" ref={wrapRef}>
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        /* пропорция вида держится равной окну; none страхует от полос в
           момент, когда окно уже изменилось, а вид ещё догоняет */
        preserveAspectRatio="none"
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
            if (off > 4) {
              moved.current = true;
              setCard((c) => (c ? null : c));
            }
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
        {showTiles ? (
          svgTiles(view, screen.w).map((t) => (
            <image
              key={t.key}
              href={tileUrl(tileTemplate!, t)}
              x={t.sx}
              y={t.sy}
              // лёгкий напуск закрывает волосяные швы между тайлами
              width={t.size * 1.004}
              height={t.size * 1.004}
              preserveAspectRatio="none"
            />
          ))
        ) : (
          <path d={LAND_D} fill="var(--land)" stroke="var(--line-strong)" strokeWidth={0.6 * s} opacity={0.9} />
        )}

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
          const mid = priceLabelPos(a, b, mode, s);
          return (
            <g key={l.id}>
              <path
                d={d}
                fill="none"
                className={searching ? "searching" : undefined}
                stroke={searching ? "var(--accent)" : MODE_COLOR[mode]}
                strokeWidth={(hoveredLeg === l.id ? 4.4 : 2.4) * s}
                strokeDasharray={
                  searching
                    ? `${4 * s} ${8 * s}`
                    : mode === "bus"
                      ? `${7 * s} ${5 * s}`
                      : l.selectedOffer
                        ? undefined
                        : `${3 * s} ${5 * s}`
                }
              />
              {transferPts.map((p) => (
                <g key={p.name}>
                  <circle cx={p.x} cy={p.y} r={4 * s} fill="var(--panel)" stroke={MODE_COLOR[mode]} strokeWidth={1.8 * s} />
                  <text x={p.x + 8 * s} y={p.y - 6 * s} fontSize={10 * s} fill="var(--ink-3)">
                    {p.name}
                  </text>
                </g>
              ))}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={16 * s}
                style={{ cursor: "pointer" }}
                onPointerEnter={() => onHover(l.id)}
                onPointerLeave={() => onHover(null)}
              />
              {l.selectedOffer && (
                <text
                  x={mid.x}
                  y={mid.y}
                  textAnchor="middle"
                  fontSize={10.5 * s}
                  fontWeight={600}
                  fill="var(--ink-2)"
                  // гало цветом фона: цена читается и там, где её всё же
                  // пересекает чужое плечо на плотном маршруте
                  stroke="var(--bg)"
                  strokeWidth={3 * s}
                  paintOrder="stroke"
                >
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
          // у правого края видимой области подпись уходит влево от точки
          const right = p.x > view.x + view.w * 0.78;
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
              {st && <circle cx={p.x} cy={p.y} r={15 * s} fill="transparent" />}
              {hot && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={12 * s}
                  fill="none"
                  stroke="var(--hotel)"
                  strokeWidth={1.6 * s}
                  opacity={0.5}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={(st ? (hot ? 9 : 7) : 5.5) * s}
                fill={st ? "var(--hotel)" : "var(--ink-2)"}
                stroke="var(--panel)"
                strokeWidth={2 * s}
              />
              <text
                x={right ? p.x - 12 * s : p.x + 12 * s}
                y={p.y + 4 * s}
                textAnchor={right ? "end" : "start"}
                fontSize={11.5 * s}
                fontWeight={600}
                fill={st ? "var(--ink)" : "var(--ink-2)"}
              >
                {c.name}
              </text>
              {hot && (
                <text
                  x={right ? p.x - 12 * s : p.x + 12 * s}
                  y={p.y + 17 * s}
                  textAnchor={right ? "end" : "start"}
                  fontSize={10 * s}
                  fontWeight={600}
                  fill="var(--hotel)"
                >
                  {hotel ? `${hotel.name} · ${fmt(hotel.price)}` : "выбрать отель"}
                </text>
              )}
            </g>
          );
        })}

        {/* пины отелей: веер синхронизирует свой отфильтрованный список */}
        {pick &&
          pick.hotels.map((h) => {
            if (h.lat === undefined || h.lng === undefined) return null;
            const p = project(h.lat, h.lng);
            const label = fmt(h.price);
            const w = (label.length * 6.4 + 16) * s;
            const hgt = 18 * s;
            const hot = pick.hoveredId === h.hotelId || card?.hotel.hotelId === h.hotelId;
            const sel = pickStay?.selectedHotel?.hotelId === h.hotelId;
            return (
              <g
                key={h.hotelId}
                style={{ cursor: "pointer" }}
                onClick={(e) => {
                  if (moved.current) return;
                  const r = wrapRef.current!.getBoundingClientRect();
                  setCard({ hotel: h, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
              >
                <rect
                  x={p.x - w / 2}
                  y={p.y - hgt / 2}
                  width={w}
                  height={hgt}
                  rx={9 * s}
                  fill={hot || sel ? "var(--hotel)" : "var(--panel)"}
                  stroke="var(--hotel)"
                  strokeWidth={(hot ? 2 : 1.2) * s}
                />
                <text
                  x={p.x}
                  y={p.y + 3.6 * s}
                  textAnchor="middle"
                  fontSize={10.5 * s}
                  fontWeight={600}
                  fill={hot || sel ? "var(--panel)" : "var(--hotel)"}
                >
                  {label}
                </text>
              </g>
            );
          })}
      </svg>

      {card && pick && pickStay && (
        <div
          className="hcard"
          style={{
            left: Math.max(10, Math.min((wrapRef.current?.clientWidth ?? 600) - 240, card.x - 115)),
            top: Math.max(10, card.y - 200),
          }}
        >
          {card.hotel.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ph" src={card.hotel.photo} alt="" />
          ) : (
            <div className="ph empty">фото нет</div>
          )}
          <div className="body">
            <div className="nm">{card.hotel.name}</div>
            <div className="meta">
              {card.hotel.stars ? `${card.hotel.stars}★` : "без звёзд"}
              {card.hotel.rating ? ` · ${card.hotel.rating.toFixed(1)}` : ""}
              {card.hotel.address ? ` · ${card.hotel.address}` : ""}
            </div>
            <div className="meta">
              <b>{fmt(card.hotel.price)}</b> за {pickStay.nights} ноч. ·{" "}
              {fmt(card.hotel.price / pickStay.nights)}/ночь
            </div>
            <div className="acts">
              <button className="btn sm" onClick={() => onOpenRooms(card.hotel, pickStay)}>
                Выбрать номер
              </button>
              <button
                className="btn primary sm"
                onClick={() => {
                  chooseHotel(pick.key, card.hotel);
                  setCard(null);
                  onHotelChosen();
                }}
              >
                Ок
              </button>
              <button className="btn sm" onClick={() => setCard(null)} aria-label="Закрыть карточку">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="zoomctl">
        <button className="btn" aria-label="Приблизить" onClick={() => zoomAt(1 / 1.35)}>+</button>
        <button className="btn" aria-label="Отдалить" onClick={() => zoomAt(1.35)}>−</button>
        <button
          className="btn"
          aria-label="Весь маршрут"
          onClick={() => setView({ ...HOME, h: HOME.w * aspectRef.current })}
        >
          ⌂
        </button>
        {TILES && (
          <button
            className="btn"
            aria-label={tiled ? "Схематичная карта" : "Подробная карта"}
            title={tiled ? "Схематичная карта" : "Подробная карта"}
            onClick={() =>
              setTiled((t) => {
                localStorage.setItem("tropa.mapTiles", t ? "off" : "on");
                return !t;
              })
            }
          >
            {tiled ? "▤" : "🗺"}
          </button>
        )}
      </div>
      {showTiles && <div className="attr">{ATTRIBUTION}</div>}

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
        .hcard {
          position: absolute;
          width: 230px;
          background: var(--panel);
          border: 1px solid var(--line);
          border-radius: 12px;
          box-shadow: var(--shadow);
          overflow: hidden;
          z-index: 30;
        }
        .hcard .ph {
          display: block;
          width: 100%;
          height: 96px;
          object-fit: cover;
        }
        .hcard .ph.empty {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--ink-3);
          font-size: 12px;
          background: var(--panel-2);
        }
        .hcard .body {
          padding: 8px 10px 10px;
        }
        .hcard .nm {
          font-size: 13px;
          font-weight: 600;
          line-height: 1.3;
        }
        .hcard .meta {
          font-size: 11.5px;
          color: var(--ink-2);
          margin-top: 2px;
        }
        .hcard .acts {
          display: flex;
          gap: 6px;
          margin-top: 8px;
        }
        .attr {
          position: absolute;
          left: 8px;
          bottom: 6px;
          font-size: 10px;
          color: var(--ink-3);
          background: color-mix(in srgb, var(--panel) 72%, transparent);
          padding: 1px 6px;
          border-radius: 6px;
          pointer-events: none;
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
