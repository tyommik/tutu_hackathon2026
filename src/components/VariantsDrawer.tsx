"use client";

import { useEffect, useState } from "react";
import { applyAviaFilters, layoverSummary, withVariant, type AviaFilters } from "@/lib/aviaFilters";
import { resolveCoords } from "@/lib/cities";
import { HotelMap } from "./HotelMap";
import {
  applyHotelFilters,
  activeFilterCount,
  DISTANCES,
  EMPTY_HOTEL_FILTERS,
  HOTEL_AMENITIES,
  HOTEL_TYPES,
  hotelSearchArgs,
  MEALS,
  parseDistanceToCenter,
  RATINGS,
  ROOM_AMENITIES,
  STARS,
  type HotelFilters,
} from "@/lib/hotelFilters";
import {
  BED_TYPES,
  hotelMatchesRooms,
  ROOM_COUNTS,
  type BedType,
  type RoomSnapshot,
} from "@/lib/rooms";
import { formatMinutes, stayKey, type HotelSnapshot, type Leg, type OfferSnapshot, type Stay } from "@/lib/trip";
import { useTrip } from "@/store/useTrip";

export type VariantsTarget = { kind: "leg"; leg: Leg } | { kind: "stay"; stay: Stay };

interface CarrierInfo {
  name: string;
  offers_count: number;
  price_from: number;
}

function fmt(n: number) {
  return Math.round(n).toLocaleString("ru-RU") + " ₽";
}

/**
 * С настроенными тайлами отели выбираются на главной карте (пины поверх
 * маршрута, зум в город); без них городской зум там пуст — остаётся
 * прежняя отдельная панель с собственной картой.
 */
const MAP_PICK = !!process.env.NEXT_PUBLIC_TILES_URL;

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
}

function MultiGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<{ id: string; label: string }>;
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="grp">
      {title}
      <div className="chips">
        {options.map((o) => (
          <button
            key={o.id}
            className={`chip${selected.includes(o.id) ? " on" : ""}`}
            onClick={() => onToggle(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function VariantsDrawer({
  target,
  onClose,
  onOpenRooms,
}: {
  target: VariantsTarget | null;
  onClose: () => void;
  onOpenRooms: (hotel: HotelSnapshot, stay: Stay) => void;
}) {
  const { legOffers, stayHotels, party, coords, chooseOffer, chooseHotel, setHotelPick } = useTrip();
  const [hoverHotel, setHoverHotel] = useState<string | null>(null);

  const isAviaLeg =
    target?.kind === "leg" &&
    (target.leg.selectedOffer?.mode === "avia" || target.leg.mode === "avia");

  const [filters, setFilters] = useState<AviaFilters>({ withBaggage: false, refundable: false });
  const [directOnly, setDirectOnly] = useState(false);
  const [carrier, setCarrier] = useState<string | null>(null);
  const [aviaOffers, setAviaOffers] = useState<OfferSnapshot[] | null>(null);
  const [carriersAvail, setCarriersAvail] = useState<CarrierInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const [hf, setHf] = useState<HotelFilters>(EMPTY_HOTEL_FILTERS);
  const [hotelPool, setHotelPool] = useState<HotelSnapshot[] | null>(null);
  const [hotelsOpen, setHotelsOpen] = useState(false);
  const nights = target?.kind === "stay" ? target.stay.nights : 1;

  // фильтры по номерам (кровати, комнаты) требуют деталей каждого отеля
  const [beds, setBeds] = useState<BedType[]>([]);
  const [roomCounts, setRoomCounts] = useState<number[]>([]);
  const [roomsByHotel, setRoomsByHotel] = useState<Record<string, RoomSnapshot[]>>({});
  const [roomsLoading, setRoomsLoading] = useState(false);
  const needRoomDetails = beds.length > 0 || roomCounts.length > 0;

  // отели: пере-поиск с серверными фильтрами MCP (кэш гасит повторы)
  useEffect(() => {
    if (target?.kind !== "stay") return;
    const stay = target.stay;
    setLoading(true);
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "stay",
        city: stay.city.name,
        checkin: stay.checkin,
        checkout: stay.checkout,
        pageSize: 20,
        party,
        filters: hotelSearchArgs(hf, stay.nights),
      }),
    })
      .then((r) => r.json())
      .then((d) => setHotelPool(d.hotels ?? []))
      .catch(() => setHotelPool([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.kind === "stay" ? stayKey(target.stay) : null, JSON.stringify(hf)]);

  // авиа: свой поиск с серверными фильтрами (кэш делает повторы бесплатными)
  useEffect(() => {
    if (!isAviaLeg || target?.kind !== "leg") return;
    const leg = target.leg;
    setLoading(true);
    fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "leg",
        origin: leg.from.name,
        destination: leg.to.name,
        date: leg.date,
        mode: "avia",
        pageSize: 15,
        party,
        directOnly: directOnly || undefined,
        carriers: carrier ? [carrier] : undefined,
      }),
    })
      .then((r) => r.json())
      .then((d) => {
        setAviaOffers(d.offers ?? []);
        const avail = (d.meta?.carriers_available ?? []) as CarrierInfo[];
        // список перевозчиков фиксируем по нефильтрованному ответу
        if (!carrier && !directOnly) setCarriersAvail(avail.slice(0, 8));
      })
      .catch(() => setAviaOffers([]))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAviaLeg, target?.kind === "leg" ? target.leg.id : null, directOnly, carrier]);

  // догрузка деталей номеров, когда включены фильтры кровати/комнаты
  useEffect(() => {
    if (target?.kind !== "stay" || !needRoomDetails) return;
    const stay = target.stay;
    const pool = hotelPool ?? [];
    const missing = pool.filter((h) => !roomsByHotel[h.hotelId]).slice(0, 20);
    if (missing.length === 0) return;
    let cancelled = false;
    setRoomsLoading(true);
    const load = async () => {
      // по 4 запроса за раз, чтобы не залить MCP
      for (let i = 0; i < missing.length; i += 4) {
        if (cancelled) return;
        const batch = missing.slice(i, i + 4);
        const results = await Promise.all(
          batch.map((h) =>
            fetch("/api/rooms", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                hotelId: h.hotelId,
                checkin: stay.checkin,
                checkout: stay.checkout,
                party,
              }),
            })
              .then((r) => r.json())
              .then((d) => [h.hotelId, (d.rooms ?? []) as RoomSnapshot[]] as const)
              .catch(() => [h.hotelId, [] as RoomSnapshot[]] as const),
          ),
        );
        if (cancelled) return;
        setRoomsByHotel((prev) => ({ ...prev, ...Object.fromEntries(results) }));
      }
    };
    void load().finally(() => !cancelled && setRoomsLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [needRoomDetails, hotelPool, target?.kind === "stay" ? stayKey(target.stay) : null]);

  useEffect(() => {
    // сброс фильтров при смене плеча/ночёвки
    setFilters({ withBaggage: false, refundable: false });
    setDirectOnly(false);
    setCarrier(null);
    setAviaOffers(null);
    setCarriersAvail([]);
    setHf(EMPTY_HOTEL_FILTERS);
    setHotelPool(null);
    setHotelsOpen(false);
    setBeds([]);
    setRoomCounts([]);
    setRoomsByHotel({});
  }, [target?.kind === "leg" ? target.leg.id : target ? stayKey(target.stay) : null]);

  const open = target !== null;
  const title =
    target?.kind === "leg"
      ? `${target.leg.from.name} → ${target.leg.to.name}`
      : target
        ? `Отель · ${target.stay.city.name}`
        : "";

  const legPool =
    target?.kind === "leg"
      ? isAviaLeg
        ? (aviaOffers ?? legOffers[target.leg.id] ?? [])
        : (legOffers[target.leg.id] ?? [])
      : [];
  const filtered = target?.kind === "leg" ? applyAviaFilters(legPool, filters) : [];

  // один и тот же отфильтрованный список кормит и карточки, и пины на карте
  const visibleHotels =
    target?.kind === "stay"
      ? applyHotelFilters(hotelPool ?? stayHotels[stayKey(target.stay)] ?? [], hf, nights).filter((h) =>
          hotelMatchesRooms(roomsByHotel[h.hotelId], beds, roomCounts),
        )
      : [];
  const cityCenter =
    target?.kind === "stay"
      ? (resolveCoords(target.stay.city.name) ?? coords[target.stay.city.name])
      : undefined;

  // синк пинов на главную карту: сигнатура по id бережёт от цикла ре-рендеров
  const pickKey = target?.kind === "stay" ? stayKey(target.stay) : null;
  const pickSig = visibleHotels.map((h) => h.hotelId).join(",");
  useEffect(() => {
    if (!MAP_PICK) return;
    if (pickKey) setHotelPick({ key: pickKey, hotels: visibleHotels, hoveredId: hoverHotel });
    else setHotelPick(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickKey, pickSig, hoverHotel]);
  // размонтирование веера не должно оставить пины на карте
  useEffect(
    () => () => {
      if (MAP_PICK) useTrip.getState().setHotelPick(null);
    },
    [],
  );

  return (
    <div className={`drawer${open ? " open" : ""}`}>
      {target?.kind === "stay" && !MAP_PICK && (
        <HotelMap
          key={stayKey(target.stay)}
          hotels={visibleHotels}
          center={cityCenter}
          nights={nights}
          loading={loading}
          selectedId={target.stay.selectedHotel?.hotelId}
          hoveredId={hoverHotel}
          onHover={setHoverHotel}
          onChoose={(h) => {
            chooseHotel(stayKey(target.stay), h);
            onClose();
          }}
          onOpenRooms={(h) => onOpenRooms(h, target.stay)}
        />
      )}
      <div className="head">
        <span className="t">{title}</span>
        <button className="btn" style={{ padding: "5px 10px" }} onClick={onClose} aria-label="Закрыть">✕</button>
      </div>

      {isAviaLeg && (
        <div className="filters">
          <div className="chips">
            <button className={`chip${directOnly ? " on" : ""}`} onClick={() => setDirectOnly((v) => !v)}>
              Прямые
            </button>
            <button
              className={`chip${filters.withBaggage ? " on" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, withBaggage: !f.withBaggage }))}
            >
              С багажом
            </button>
            <button
              className={`chip${filters.refundable ? " on" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, refundable: !f.refundable }))}
            >
              С возвратом
            </button>
          </div>
          {carriersAvail.length > 0 && (
            <div className="chips carriers">
              {carriersAvail.map((c) => (
                <button
                  key={c.name}
                  className={`chip${carrier === c.name ? " on" : ""}`}
                  title={`от ${fmt(c.price_from)}`}
                  onClick={() => setCarrier((v) => (v === c.name ? null : c.name))}
                >
                  {c.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {target?.kind === "stay" && (
        <div className="filters">
          <div className="chips">
            <button
              className={`chip${hf.freeCancellation ? " on" : ""}`}
              onClick={() => setHf((f) => ({ ...f, freeCancellation: !f.freeCancellation }))}
            >
              Бесплатная отмена
            </button>
            <button className="chip more" onClick={() => setHotelsOpen((v) => !v)}>
              {hotelsOpen ? "Свернуть фильтры" : "Все фильтры"}
              {activeFilterCount(hf) > 0 ? ` · ${activeFilterCount(hf)}` : ""}
            </button>
            {activeFilterCount(hf) > 0 && (
              <button className="chip reset" onClick={() => setHf(EMPTY_HOTEL_FILTERS)}>
                Сбросить
              </button>
            )}
          </div>

          {hotelsOpen && (
            <div className="panel">
              <label className="grp">
                Цена за ночь, ₽
                <span className="range">
                  <input
                    type="number"
                    min={0}
                    placeholder="от"
                    value={hf.priceMin ?? ""}
                    onChange={(e) => setHf((f) => ({ ...f, priceMin: Number(e.target.value) || undefined }))}
                  />
                  <input
                    type="number"
                    min={0}
                    placeholder="до"
                    value={hf.priceMax ?? ""}
                    onChange={(e) => setHf((f) => ({ ...f, priceMax: Number(e.target.value) || undefined }))}
                  />
                </span>
              </label>

              <MultiGroup
                title="Размещение"
                options={HOTEL_TYPES.map((t) => ({ id: t.id, label: t.label }))}
                selected={hf.types}
                onToggle={(id) =>
                  setHf((f) => ({ ...f, types: toggle(f.types, id) }))
                }
              />

              <div className="grp">
                Звёзды
                <div className="chips">
                  {STARS.map((s) => (
                    <button
                      key={s.value}
                      className={`chip${hf.stars.includes(s.value) ? " on" : ""}`}
                      onClick={() => setHf((f) => ({ ...f, stars: toggle(f.stars, s.value) }))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <MultiGroup
                title="Питание"
                options={MEALS}
                selected={hf.meals}
                onToggle={(id) => setHf((f) => ({ ...f, meals: toggle(f.meals, id) }))}
              />

              <div className="grp">
                Рейтинг
                <div className="chips">
                  {RATINGS.map((r) => (
                    <button
                      key={r.label}
                      className={`chip${hf.minRating === r.value ? " on" : ""}`}
                      onClick={() => setHf((f) => ({ ...f, minRating: r.value }))}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grp">
                До центра
                <div className="chips">
                  {DISTANCES.map((d) => (
                    <button
                      key={d.label}
                      className={`chip${hf.maxToCenter === d.value ? " on" : ""}`}
                      onClick={() => setHf((f) => ({ ...f, maxToCenter: d.value }))}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <MultiGroup
                title="Удобства"
                options={HOTEL_AMENITIES}
                selected={hf.hotelAmenities}
                onToggle={(id) => setHf((f) => ({ ...f, hotelAmenities: toggle(f.hotelAmenities, id) }))}
              />

              <MultiGroup
                title="В номере"
                options={ROOM_AMENITIES}
                selected={hf.roomAmenities}
                onToggle={(id) => setHf((f) => ({ ...f, roomAmenities: toggle(f.roomAmenities, id) }))}
              />

              <div className="grp">
                Тип кровати
                <div className="chips">
                  {BED_TYPES.map((b) => (
                    <button
                      key={b.id}
                      className={`chip${beds.includes(b.id) ? " on" : ""}`}
                      onClick={() => setBeds((v) => toggle(v, b.id))}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grp">
                Количество комнат
                <div className="chips">
                  {ROOM_COUNTS.map((c) => (
                    <button
                      key={c.id}
                      className={`chip${roomCounts.includes(c.id) ? " on" : ""}`}
                      onClick={() => setRoomCounts((v) => toggle(v, c.id))}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {needRoomDetails && (
                <p className="hint">
                  {roomsLoading
                    ? "Смотрим номера в найденных отелях…"
                    : "Фильтр по номерам: отель проходит, если хотя бы один его номер подходит."}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="list">
        {target?.kind === "leg" && loading && <div className="none">Ищем рейсы под фильтры…</div>}

        {target?.kind === "leg" &&
          !loading &&
          filtered.map(({ offer: o, variant, displayPrice }) => {
            const sel = target.leg.selectedOffer?.offerId === o.offerId;
            const stops = layoverSummary(o);
            return (
              <button
                key={o.offerId + (variant?.variantId ?? "")}
                className={`var${sel ? " sel" : ""}`}
                onClick={() => {
                  chooseOffer(target.leg.id, variant ? withVariant(o, variant) : o);
                  onClose();
                }}
              >
                <div className="r">
                  <span className="n">{o.carriers.join(", ") || o.mode}</span>
                  {sel && <span className="badge">выбрано</span>}
                  <span className="p">{fmt(displayPrice)}</span>
                </div>
                <div className="s">
                  {o.departureAt.slice(11, 16)} → {o.arrivalAt.slice(11, 16)}
                  {o.durationMin ? ` · в пути ${formatMinutes(o.durationMin)}` : ""}
                  {!stops ? (o.mode === "avia" ? " · прямой" : ` · ${o.mode}`) : ""}
                </div>
                {stops && (
                  <div className={`s stops${stops.tight ? " tight" : ""}`}>
                    {stops.tight ? "⚠ " : stops.long ? "◔ " : "⇄ "}
                    {stops.text}
                  </div>
                )}
                {variant && (
                  <div className="s fare">
                    тариф {variant.fareFamily ?? "—"}
                    {(variant.baggagePieces ?? 0) > 0 || (variant.baggageKg ?? 0) > 0
                      ? ` · багаж ${variant.baggageKg ? `${variant.baggageKg} кг` : `${variant.baggagePieces} мест`}`
                      : ""}
                    {variant.refundable ? " · возвратный" : ""}
                  </div>
                )}
              </button>
            );
          })}

        {target?.kind === "stay" && loading && <div className="none">Ищем отели под фильтры…</div>}

        {target?.kind === "stay" &&
          !loading &&
          visibleHotels.map((h) => {
              const sel = target.stay.selectedHotel?.hotelId === h.hotelId;
              const dist = parseDistanceToCenter(h.address);
              const rooms = roomsByHotel[h.hotelId];
              return (
                <div
                  key={h.hotelId}
                  className={`var${sel ? " sel" : ""}${hoverHotel === h.hotelId ? " hl" : ""}`}
                  onPointerEnter={() => setHoverHotel(h.hotelId)}
                  onPointerLeave={() => setHoverHotel(null)}
                >
                  <div className="r">
                    <span className="n">{h.name}</span>
                    {sel && <span className="badge">выбрано</span>}
                    <span className="p">{fmt(h.price)}</span>
                  </div>
                  <div className="s">
                    {h.stars ? `${h.stars}★` : "без звёзд"}
                    {h.rating ? ` · ${h.rating.toFixed(1)}` : ""}
                    {dist !== undefined
                      ? ` · ${dist < 1000 ? `${dist} м` : `${(dist / 1000).toFixed(1)} км`} от центра`
                      : ""}
                    {` · ${fmt(h.price / nights)}/ночь`}
                  </div>
                  {(h.mealName || h.freeCancellation || h.roomName) && (
                    <div className="s fare">
                      {[h.roomName, h.mealName, h.freeCancellation ? "бесплатная отмена" : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  )}
                  {rooms && rooms.length > 0 && (
                    <div className="s rooms">
                      {rooms.length} {rooms.length === 1 ? "вариант номера" : "варианта номеров"}
                      {rooms[0].bedSummary ? ` · ${rooms[0].bedSummary}` : ""}
                    </div>
                  )}
                  <div className="act">
                    <button className="btn sm" onClick={() => onOpenRooms(h, target.stay)}>
                      Выбрать номер
                    </button>
                    <button
                      className="btn primary sm"
                      onClick={() => {
                        chooseHotel(stayKey(target.stay), h);
                        onClose();
                      }}
                    >
                      Ок
                    </button>
                  </div>
                </div>
              );
            })}

        {target?.kind === "leg" && !loading && filtered.length === 0 && (
          <div className="none">
            Под эти фильтры ничего не нашлось — попробуйте снять часть условий.
          </div>
        )}
        {target?.kind === "stay" && !loading && visibleHotels.length === 0 && (
            <div className="none">
              {roomsLoading
                ? "Смотрим номера в найденных отелях…"
                : activeFilterCount(hf) > 0 || needRoomDetails
                  ? "Под эти фильтры отелей не нашлось — снимите часть условий."
                  : "Вариантов пока нет — идёт поиск или Туту ничего не вернул."}
            </div>
          )}
      </div>

      <style jsx>{`
        .drawer {
          position: fixed;
          top: 58px;
          right: 0;
          bottom: 0;
          width: var(--panel-w);
          background: var(--panel);
          border-left: 1px solid var(--line);
          box-shadow: var(--shadow);
          z-index: 50;
          transform: translateX(105%);
          transition: transform 0.25s ease;
          display: flex;
          flex-direction: column;
        }
        .drawer.open { transform: none; }
        .head {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px;
          border-bottom: 1px solid var(--line);
        }
        .t { font-weight: 600; font-size: 15px; flex: 1; }
        .filters {
          padding: 10px 12px;
          border-bottom: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .chip {
          border: 1px solid var(--line-strong);
          border-radius: 99px;
          padding: 5px 12px;
          font-size: 12px;
        }
        .chip.on {
          border-color: var(--accent);
          background: var(--accent-soft);
          color: var(--accent);
          font-weight: 600;
        }
        .carriers .chip { font-size: 11.5px; padding: 4px 10px; }
        .chip.more { border-style: dashed; }
        .chip.reset { color: var(--danger); border-color: var(--danger); }
        .panel {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 46vh;
          overflow-y: auto;
          padding-top: 4px;
        }
        .grp {
          display: flex;
          flex-direction: column;
          gap: 5px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--ink-3);
          font-weight: 600;
        }
        .grp :global(.chip),
        .grp .chip {
          text-transform: none;
          letter-spacing: 0;
          font-weight: 400;
          color: var(--ink);
        }
        .grp :global(.chip.on),
        .grp .chip.on { color: var(--accent); font-weight: 600; }
        .range { display: flex; gap: 6px; }
        .range input {
          width: 100%;
          min-width: 0;
          font-size: 13px;
          padding: 6px 9px;
          text-transform: none;
          letter-spacing: 0;
          font-weight: 400;
          color: var(--ink);
        }
        .list {
          flex: 1;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .var {
          border: 1px solid var(--line);
          border-radius: 10px;
          padding: 10px 12px;
          text-align: left;
          width: 100%;
        }
        .var:hover,
        .var.hl { border-color: var(--accent); background: var(--panel-2); }
        .var.sel { border-color: var(--accent); background: var(--accent-soft); }
        .r { display: flex; gap: 8px; align-items: baseline; }
        .n { font-weight: 500; flex: 1; font-size: 13.5px; }
        .p { font-weight: 600; font-variant-numeric: tabular-nums; }
        .s { font-size: 12px; color: var(--ink-2); margin-top: 2px; }
        .s.fare { color: var(--rail); }
        .s.stops { color: var(--ink-3); }
        .s.stops.tight { color: var(--warn); font-weight: 500; }
        .s.rooms { color: var(--ink-3); }
        .act { display: flex; justify-content: flex-end; gap: 6px; margin-top: 8px; }
        .act :global(.btn.sm) { padding: 5px 14px; font-size: 12.5px; }
        .hint { font-size: 11.5px; color: var(--ink-3); line-height: 1.4; }
        .badge {
          font-size: 10.5px;
          background: var(--accent-soft);
          color: var(--accent);
          border-radius: 5px;
          padding: 1px 7px;
          font-weight: 600;
        }
        .none { color: var(--ink-2); font-size: 13px; padding: 8px 4px; }
      `}</style>
    </div>
  );
}
