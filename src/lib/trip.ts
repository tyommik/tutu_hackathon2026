/**
 * Модель плана поездки. `stays` деривативны: пересчитываются из `legs`.
 * Правила из дизайн-дока «Тропа».
 */

export type Mode = "rail" | "avia" | "bus" | "etrain" | "any";

/** Состав поездки: кто едет. Возраст детей нужен отелям и авиа-тарифам. */
export interface Party {
  adults: number;
  childrenAges: number[];
}

export const DEFAULT_PARTY: Party = { adults: 1, childrenAges: [] };

export function partyLabel(p: Party): string {
  const a =
    p.adults === 1 ? "1 взрослый" : `${p.adults} взросл${p.adults < 5 ? "ых" : "ых"}`;
  if (p.childrenAges.length === 0) return a;
  const kids =
    p.childrenAges.length === 1
      ? `ребёнок ${p.childrenAges[0]} лет`
      : `дети: ${p.childrenAges.join(", ")} лет`;
  return `${a} · ${kids}`;
}

export interface CityRef {
  name: string;
  geoId?: number;
  lat?: number;
  lng?: number;
}

export interface SegmentSnapshot {
  from: string;
  to: string;
  departureAt: string;
  arrivalAt: string;
  carrier?: string;
}

/** Тарифный вариант оффера (авиа fare family, автобусные тарифы). */
export interface VariantSnapshot {
  variantId: string;
  price: number;
  fareFamily?: string;
  baggagePieces?: number;
  baggageKg?: number;
  refundable?: boolean;
  changeable?: boolean;
  serviceClass?: string;
  offerHash?: unknown;
}

export interface OfferSnapshot {
  offerId: string;
  price: number;
  currency: string;
  carriers: string[];
  departureAt: string;
  arrivalAt: string;
  durationMin?: number;
  mode: Exclude<Mode, "any">;
  checkoutRef: Record<string, unknown>;
  searchResultsUrl?: string;
  /** Для rail: ref для get_rail_seatmap (схема вагона). */
  detailsRef?: Record<string, unknown>;
  segmentsCount?: number;
  segments?: SegmentSnapshot[];
  variants?: VariantSnapshot[];
  /** Выбранный пользователем тариф (fare family) — для checkout. */
  chosenFare?: string;
}

export interface HotelSnapshot {
  hotelId: string;
  name: string;
  stars?: number;
  price: number;
  currency: string;
  checkoutRef: Record<string, unknown>;
  rating?: number;
  reviewCount?: number;
  /** «778 м от центра» — источник расстояния до центра */
  address?: string;
  roomName?: string;
  mealName?: string;
  breakfastIncluded?: boolean;
  freeCancellation?: boolean;
  photo?: string;
  /** Координаты отеля из MCP — по ним он попадает на карту. */
  lat?: number;
  lng?: number;
}

/**
 * Заметка к карточке плана: что успеть посмотреть, что не забыть.
 * source различает свой текст и подсказку ИИ — второе UI подписывает,
 * чтобы совет модели не выглядел как данные Туту.
 */
export interface Note {
  text: string;
  source: "user" | "ai";
}

export interface Leg {
  id: string;
  from: CityRef;
  to: CityRef;
  /** YYYY-MM-DD — дата отправления */
  date: string;
  mode: Mode;
  selectedOffer?: OfferSnapshot;
  /** Оффер выбран пользователем вручную — авто-ремонт его не трогает. */
  pinned?: boolean;
  /** Сколько раз авто-ремонт сдвигал дату ради стыковки (кап — 2). */
  autoShifts?: number;
  /** Выбранные на схеме вагона места (rail). */
  seatChoice?: { carNumber: string; seatNumbers: string[] };
  /**
   * Оффер, закреплённый в восстановленной из ссылки поездке. Держим до
   * первого поиска: как только он найдётся среди офферов — выберем именно
   * его, а не самый дешёвый.
   */
  wantOfferId?: string;
  note?: Note;
}

export interface Stay {
  city: CityRef;
  /** YYYY-MM-DD */
  checkin: string;
  checkout: string;
  nights: number;
  selectedHotel?: HotelSnapshot;
  note?: Note;
}

export interface Trip {
  legs: Leg[];
  stays: Stay[];
}

export function cityId(c: CityRef): string {
  return c.geoId ? String(c.geoId) : slug(c.name);
}

export function slug(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}

/** Стабильный id плеча; при коллизии — суффикс. */
export function legId(from: CityRef, to: CityRef, date: string, taken: Set<string> = new Set()): string {
  const base = `${cityId(from)}-${cityId(to)}-${date}`;
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

/** Календарная дата (YYYY-MM-DD) из ISO-строки с локальным offset'ом. */
export function localDate(iso: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso);
  if (!m) throw new Error(`Не ISO-дата: ${iso}`);
  return m[1];
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Ночёвки между последовательными плечами: checkin = дата прибытия плеча N,
 * checkout = дата отправления плеча N+1. При 0 ночей Stay не создаётся.
 * Прилёт ночным поездом утром 11.09 → checkin 11.09, а не 10.09.
 */
export function deriveStays(legs: Leg[], previous: Stay[] = []): Stay[] {
  const keep = new Map(previous.map((s) => [stayKey(s), s]));
  // заметка привязана к городу, а не к датам: сдвиг ночёвки её не стирает
  const notes = new Map(
    previous.filter((s) => s.note).map((s) => [cityId(s.city), s.note as Note]),
  );
  const out: Stay[] = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const cur = legs[i];
    const next = legs[i + 1];
    const arrival = cur.selectedOffer ? localDate(cur.selectedOffer.arrivalAt) : cur.date;
    const departure = next.selectedOffer ? localDate(next.selectedOffer.departureAt) : next.date;
    const nights = daysBetween(arrival, departure);
    if (nights <= 0) continue;
    const stay: Stay = { city: cur.to, checkin: arrival, checkout: departure, nights };
    const prior = keep.get(stayKey(stay));
    if (prior?.selectedHotel) stay.selectedHotel = prior.selectedHotel;
    const note = prior?.note ?? notes.get(cityId(stay.city));
    if (note) stay.note = note;
    out.push(stay);
  }
  return out;
}

export function stayKey(s: Stay): string {
  return `${cityId(s.city)}:${s.checkin}:${s.checkout}`;
}

export interface ConnectionWarning {
  legId: string;
  kind: "impossible" | "tight";
  minutes: number;
  message: string;
}

/**
 * Инвариант стыковок: плечо N+1 не может отправляться раньше прибытия N.
 * Клиентская пометка, маршрут не блокируется.
 */
export function connectionWarnings(legs: Leg[], tightMinutes = 120): ConnectionWarning[] {
  const out: ConnectionWarning[] = [];
  for (let i = 0; i < legs.length - 1; i++) {
    const a = legs[i].selectedOffer;
    const b = legs[i + 1].selectedOffer;
    if (!a || !b) continue;
    const gap = Math.round((Date.parse(b.departureAt) - Date.parse(a.arrivalAt)) / 60_000);
    if (gap < 0) {
      out.push({
        legId: legs[i + 1].id,
        kind: "impossible",
        minutes: gap,
        message: `Не успеваете: отправление раньше прибытия на ${formatMinutes(-gap)}`,
      });
    } else if (gap < tightMinutes) {
      out.push({
        legId: legs[i + 1].id,
        kind: "tight",
        minutes: gap,
        message: `Стыковка ${formatMinutes(gap)} — впритык`,
      });
    }
  }
  return out;
}

export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} мин`;
  if (m === 0) return `${h} ч`;
  return `${h} ч ${m} мин`;
}

export function tripTotal(trip: Trip): number {
  const legs = trip.legs.reduce((a, l) => a + (l.selectedOffer?.price ?? 0), 0);
  const stays = trip.stays.reduce((a, s) => a + (s.selectedHotel?.price ?? 0), 0);
  return legs + stays;
}

/** Смена даты/направления сбрасывает выбранный оффер плеча. */
export function updateLeg(trip: Trip, legId: string, patch: Partial<Pick<Leg, "date" | "from" | "to" | "mode">>): Trip {
  const legs = trip.legs.map((l) => {
    if (l.id !== legId) return l;
    const changed =
      (patch.date && patch.date !== l.date) ||
      (patch.from && cityId(patch.from) !== cityId(l.from)) ||
      (patch.to && cityId(patch.to) !== cityId(l.to));
    const next: Leg = { ...l, ...patch };
    if (changed) delete next.selectedOffer;
    return next;
  });
  legs.sort((a, b) => a.date.localeCompare(b.date));
  return { legs, stays: deriveStays(legs, trip.stays) };
}

/** Вставка города в середину: плечо A→B заменяется на A→X и X→B (mode='any'). */
export function insertCity(trip: Trip, legId: string, city: CityRef, date: string): Trip {
  const ix = trip.legs.findIndex((l) => l.id === legId);
  if (ix < 0) return trip;
  const target = trip.legs[ix];
  const taken = new Set(trip.legs.map((l) => l.id));
  const first: Leg = {
    id: legIdFor(target.from, city, target.date, taken),
    from: target.from,
    to: city,
    date: target.date,
    mode: "any",
  };
  taken.add(first.id);
  const second: Leg = {
    id: legIdFor(city, target.to, date, taken),
    from: city,
    to: target.to,
    date,
    mode: "any",
  };
  const legs = [...trip.legs.slice(0, ix), first, second, ...trip.legs.slice(ix + 1)];
  return { legs, stays: deriveStays(legs, trip.stays) };
}

function legIdFor(from: CityRef, to: CityRef, date: string, taken: Set<string>): string {
  return legId(from, to, date, taken);
}

/** Удаление города: смежные плечи сливаются в одно (mode='any'). */
export function removeCity(trip: Trip, city: CityRef): Trip {
  const id = cityId(city);
  const legs: Leg[] = [];
  for (const l of trip.legs) {
    const prev = legs[legs.length - 1];
    if (prev && cityId(prev.to) === id && cityId(l.from) === id) {
      legs[legs.length - 1] = {
        id: legId(prev.from, l.to, prev.date, new Set(legs.map((x) => x.id))),
        from: prev.from,
        to: l.to,
        date: prev.date,
        mode: "any",
      };
      continue;
    }
    legs.push(l);
  }
  const filtered = legs.filter((l) => cityId(l.from) !== id && cityId(l.to) !== id);
  return { legs: filtered, stays: deriveStays(filtered, trip.stays) };
}
