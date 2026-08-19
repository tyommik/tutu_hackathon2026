import { callTool } from "./mcp";
import { cacheKey, cached } from "./cache";
import { DEFAULT_PARTY, type HotelSnapshot, type Mode, type OfferSnapshot, type Party } from "./trip";

/**
 * Маппинг состава на параметры конкретного инструмента MCP.
 * Подростки 12+ везде считаются взрослыми (граница авиа-тарифа);
 * multitransport принимает только взрослых (ограничение MCP), rail —
 * только количество пассажиров.
 */
export function paxArgs(tool: string, party: Party): Record<string, unknown> {
  const teens = party.childrenAges.filter((a) => a >= 12).length;
  const kids = party.childrenAges.filter((a) => a >= 2 && a < 12).length;
  const infants = party.childrenAges.filter((a) => a < 2).length;
  const adultsLike = party.adults + teens;
  switch (tool) {
    case "search_avia":
      return { adults: adultsLike, children: kids, infants };
    case "search_bus":
      return { adults: adultsLike, children: kids + infants };
    case "search_rail":
      return { passengers: adultsLike };
    case "search_multitransport":
      return { adults: adultsLike };
    case "search_hotels":
      return { adults: party.adults, children_ages: party.childrenAges };
    default:
      return {};
  }
}

interface RawPrice { amount: number; currency: string }
export interface UnavailableMode {
  mode: string;
  reason?: string;
  detail?: string;
}

interface RawVariant {
  variant_id?: string;
  price?: RawPrice;
  service_class?: string;
  offer_hash?: unknown;
  conditions?: {
    fare_family?: string;
    baggage?: { kg?: number; pieces?: number } | null;
    refundable?: boolean;
    changeable?: boolean;
  };
}

interface RawSegment {
  from?: string;
  to?: string;
  departure_at?: string;
  arrival_at?: string;
  carrier?: string;
}

interface RawOffer {
  offer_id: string;
  transport: "avia" | "railway" | "rail" | "bus" | "etrain";
  price: RawPrice;
  duration_min?: number;
  carriers?: string[];
  departure_at: string;
  arrival_at: string;
  segments_count?: number;
  legs?: Array<{ segments?: RawSegment[] }>;
  variants?: RawVariant[];
  checkout_ref?: Record<string, unknown>;
  search_results_url?: string;
  details_ref?: Record<string, unknown>;
}

/** Та же страховка для плеч: оффер без цены выиграл бы любое сравнение. */
function hasPrice(o: RawOffer): boolean {
  return typeof o.price?.amount === "number" && o.price.amount > 0;
}

const TOOL_BY_MODE: Record<Exclude<Mode, "any">, string> = {
  rail: "search_rail",
  avia: "search_avia",
  bus: "search_bus",
  etrain: "search_etrain",
};

function normMode(t: RawOffer["transport"]): Exclude<Mode, "any"> {
  return t === "railway" ? "rail" : (t as Exclude<Mode, "any">);
}

/**
 * Сколько мест оплачивает состав в цене этого оффера.
 *
 * Туту отдаёт цену по-разному: авиа и автобус — сразу за всю партию, им мы
 * передаём состав в запросе; ж/д и электричка — за одно место. Проверено на
 * совпадающих offer_id: при трёх пассажирах авиа и автобус дорожают втрое,
 * ж/д и электричка не меняются вовсе.
 *
 * Без приведения бюджет складывал бы несравнимое, а в смешанном поиске
 * (mode "any" возвращает поезда и самолёты одним списком) поезд всегда
 * выглядел бы дешевле, чем он есть для семьи.
 */
export function seatsFor(mode: Exclude<Mode, "any">, party: Party): number {
  if (mode !== "rail" && mode !== "etrain") return 1;
  // столько мест мы и просим у search_rail; search_etrain состав не принимает
  // вовсе, поэтому детей младше 12 здесь учесть неоткуда
  const teens = party.childrenAges.filter((a) => a >= 12).length;
  return Math.max(1, party.adults + teens);
}

export function toSnapshot(o: RawOffer, party: Party = DEFAULT_PARTY): OfferSnapshot {
  const seats = seatsFor(normMode(o.transport), party);
  return {
    offerId: o.offer_id,
    price: o.price.amount * seats,
    currency: o.price.currency,
    carriers: o.carriers ?? [],
    departureAt: o.departure_at,
    arrivalAt: o.arrival_at,
    durationMin:
      o.duration_min ??
      Math.max(0, Math.round((Date.parse(o.arrival_at) - Date.parse(o.departure_at)) / 60_000)),
    mode: normMode(o.transport),
    checkoutRef: o.checkout_ref ?? {},
    searchResultsUrl: o.search_results_url,
    detailsRef: o.details_ref,
    segmentsCount: o.segments_count,
    segments: o.legs?.[0]?.segments
      ?.filter((s) => s.from && s.to && s.departure_at && s.arrival_at)
      .map((s) => ({
        from: s.from!,
        to: s.to!,
        departureAt: s.departure_at!,
        arrivalAt: s.arrival_at!,
        carrier: s.carrier,
      })),
    variants: o.variants?.map((v, i) => ({
      variantId: v.variant_id ?? String(i),
      price: (v.price?.amount ?? o.price.amount) * seats,
      fareFamily: v.conditions?.fare_family,
      baggagePieces: v.conditions?.baggage?.pieces ?? 0,
      baggageKg: v.conditions?.baggage?.kg ?? 0,
      refundable: v.conditions?.refundable,
      changeable: v.conditions?.changeable,
      serviceClass: v.service_class,
      offerHash: v.offer_hash,
    })),
  };
}

export interface SearchLegParams {
  origin: string;
  destination: string;
  date: string;
  mode?: Mode;
  pageSize?: number;
  party?: Party;
  /** Серверные фильтры MCP (актуальны для avia). */
  directOnly?: boolean;
  carriers?: string[];
}

/**
 * Поиск на плечо. mode='any' → search_multitransport (все виды транспорта).
 * Возвращает офферы дешевле→дороже плюс флаг попадания в кэш.
 */
export async function searchLeg(p: SearchLegParams) {
  const mode = p.mode ?? "any";
  const tool = mode === "any" ? "search_multitransport" : TOOL_BY_MODE[mode];
  const args: Record<string, unknown> = {
    origin: p.origin,
    destination: p.destination,
    departure_date: p.date,
    page_size: p.pageSize ?? 5,
    ...paxArgs(tool, p.party ?? DEFAULT_PARTY),
  };
  if (mode === "any") args.optimize_for = "price";
  if (p.directOnly) args.direct_only = true;
  if (p.carriers?.length) args.carriers = p.carriers;

  const { value, hit } = await cached(cacheKey(tool, args), () =>
    callTool<{
      offers?: RawOffer[];
      variants?: RawOffer[];
      meta?: { unavailable?: UnavailableMode[] } & Record<string, unknown>;
    }>(tool, args),
  );
  const raw = (value.offers ?? value.variants ?? []).filter(hasPrice);
  const party = p.party ?? DEFAULT_PARTY;
  return {
    offers: raw.map((o) => toSnapshot(o, party)),
    raw,
    meta: value.meta,
    unavailable: value.meta?.unavailable ?? [],
    cacheHit: hit,
    tool,
  };
}

interface RawHotel {
  hotel_id: string;
  name: string;
  stars?: number;
  rating?: number;
  review_count?: number;
  address?: string;
  location?: { lat?: number | null; lng?: number | null };
  photos?: string[];
  best_offer?: {
    price?: RawPrice;
    checkout_url?: string;
    room_name?: string;
    meal_name?: string | null;
    breakfast_included?: boolean | null;
    free_cancellation?: boolean | null;
  };
  checkout_ref?: Record<string, unknown>;
}

export function toHotelSnapshot(h: RawHotel): HotelSnapshot {
  return {
    hotelId: h.hotel_id,
    name: h.name,
    stars: h.stars,
    price: h.best_offer?.price?.amount ?? 0,
    currency: h.best_offer?.price?.currency ?? "RUB",
    checkoutRef: h.checkout_ref ?? {},
    rating: h.rating,
    reviewCount: h.review_count,
    address: h.address,
    roomName: h.best_offer?.room_name,
    mealName: h.best_offer?.meal_name ?? undefined,
    breakfastIncluded: h.best_offer?.breakfast_included ?? undefined,
    freeCancellation: h.best_offer?.free_cancellation ?? undefined,
    photo: h.photos?.[0],
    lat: h.location?.lat ?? undefined,
    lng: h.location?.lng ?? undefined,
  };
}

export async function searchStay(
  city: string,
  checkin: string,
  checkout: string,
  pageSize = 5,
  party: Party = DEFAULT_PARTY,
  filters: Record<string, unknown> = {},
) {
  const args = {
    city_name: city,
    checkin_date: checkin,
    checkout_date: checkout,
    page_size: pageSize,
    ...paxArgs("search_hotels", party),
    ...filters,
  };
  const { value, hit } = await cached(cacheKey("search_hotels", args), () =>
    callTool<{ hotels?: RawHotel[]; meta?: unknown }>("search_hotels", args),
  );
  const rawAll = value.hotels ?? [];
  // Отель без цены выбрать невозможно, а в сравнениях он выглядел бы
  // бесплатным и выигрывал любой бюджет. В выдаче Туту такого не встречалось,
  // но цена там опциональна — страховка дешевле разбирательства на показе.
  const raw = rawAll.filter((h) => (h.best_offer?.price?.amount ?? 0) > 0);
  return { hotels: raw.map(toHotelSnapshot), raw: rawAll, meta: value.meta, cacheHit: hit };
}

/**
 * Checkout: MCP принимает checkout_ref «как есть» — поля объекта совпадают
 * с аргументами инструмента (проверено 2026-08-17).
 */
export async function checkoutLink(checkoutRef: Record<string, unknown>) {
  return callTool<{ checkout_url?: string; kind?: string; search_results_url?: string }>(
    "create_checkout_link",
    checkoutRef,
  );
}
