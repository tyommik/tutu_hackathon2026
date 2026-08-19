/**
 * Клиентские фильтры авиа-вариантов (веер плеча): багаж и возврат живут на
 * уровне тарифных вариантов оффера, поэтому фильтр не прячет оффер, а
 * подбирает в нём самый дешёвый подходящий тариф. Прямые и авиакомпании
 * фильтруются сервером MCP (direct_only / carriers).
 */

import { accusative } from "./morph";
import { formatMinutes, type OfferSnapshot, type VariantSnapshot } from "./trip";

export interface AviaFilters {
  withBaggage: boolean;
  refundable: boolean;
}

export function variantMatches(v: VariantSnapshot, f: AviaFilters): boolean {
  if (f.withBaggage && !((v.baggagePieces ?? 0) > 0 || (v.baggageKg ?? 0) > 0)) return false;
  if (f.refundable && !v.refundable) return false;
  return true;
}

/** Самый дешёвый тариф оффера, проходящий фильтры (варианты уже cheapest-first). */
export function cheapestMatchingVariant(
  o: OfferSnapshot,
  f: AviaFilters,
): VariantSnapshot | undefined {
  if (!f.withBaggage && !f.refundable) return undefined; // фильтров нет — базовая цена
  return (o.variants ?? []).find((v) => variantMatches(v, f));
}

export interface FilteredOffer {
  offer: OfferSnapshot;
  /** Тариф, которым оффер прошёл фильтр (undefined = базовый). */
  variant?: VariantSnapshot;
  displayPrice: number;
}

/** Офферы под фильтрами: без подходящего тарифа — выбывают. */
export function applyAviaFilters(offers: OfferSnapshot[], f: AviaFilters): FilteredOffer[] {
  const out: FilteredOffer[] = [];
  for (const offer of offers) {
    if (!f.withBaggage && !f.refundable) {
      out.push({ offer, displayPrice: offer.price });
      continue;
    }
    const v = cheapestMatchingVariant(offer, f);
    if (v) out.push({ offer, variant: v, displayPrice: v.price });
  }
  return out.sort((a, b) => a.displayPrice - b.displayPrice);
}

/** Применение тарифа к снапшоту: цена и checkout-поля варианта. */
export function withVariant(o: OfferSnapshot, v: VariantSnapshot): OfferSnapshot {
  return {
    ...o,
    price: v.price,
    chosenFare: v.fareFamily,
    checkoutRef: {
      ...o.checkoutRef,
      ...(v.offerHash !== undefined ? { offer_hash: v.offerHash } : {}),
      ...(v.serviceClass !== undefined ? { service_class: v.serviceClass } : {}),
    },
  };
}

/**
 * «Москва — Внуково (VKO), терм. A» → «Москва».
 * Аэропорт Туту пишет то через тире, то через запятую («Барселона, BCN»),
 * поэтому режем по обоим разделителям — иначе код аэропорта уезжает в
 * подписи и в геокодер.
 */
export function cityOf(segmentPoint: string): string {
  return segmentPoint.split(/ — |,/)[0]?.trim() || segmentPoint;
}

export interface Layover {
  city: string;
  minutes: number;
}

/** Короче часа — на пересадку почти наверняка не хватит времени. */
export const TIGHT_LAYOVER_MIN = 60;
/** От шести часов пересадка перестаёт быть пересадкой и становится днём в городе. */
export const LONG_LAYOVER_MIN = 6 * 60;

export interface LayoverSummary {
  /** «через Стамбул · пересадка 3 ч 20 мин» */
  text: string;
  tight: boolean;
  long: boolean;
  totalMinutes: number;
}

/**
 * Подпись о пересадках для карточки рейса. Цена и время в пути ничего не
 * говорят о том, придётся ли бежать по терминалу или ночевать в аэропорту —
 * это видно только по длительности пересадки, поэтому она в подписи.
 */
export function layoverSummary(o: OfferSnapshot): LayoverSummary | null {
  if ((o.segmentsCount ?? 1) <= 1) return null;
  const stops = layovers(o);
  if (stops.length === 0) {
    // сегменты не пришли — честно говорим, что пересадка есть, без деталей
    return { text: "с пересадкой", tight: false, long: false, totalMinutes: 0 };
  }
  const totalMinutes = stops.reduce((s, l) => s + l.minutes, 0);
  const cities = stops.map((l) => accusative(l.city)).join(", ");
  const times = stops.map((l) => formatMinutes(l.minutes)).join(" + ");
  const word = stops.length > 1 ? "пересадки" : "пересадка";
  return {
    text: `через ${cities} · ${word} ${times}`,
    tight: stops.some((l) => l.minutes < TIGHT_LAYOVER_MIN),
    long: stops.some((l) => l.minutes >= LONG_LAYOVER_MIN),
    totalMinutes,
  };
}

/** Пересадки составного рейса: город и длительность между сегментами. */
export function layovers(o: OfferSnapshot): Layover[] {
  const segs = o.segments ?? [];
  const out: Layover[] = [];
  for (let i = 0; i < segs.length - 1; i++) {
    out.push({
      city: cityOf(segs[i].to),
      minutes: Math.max(
        0,
        Math.round((Date.parse(segs[i + 1].departureAt) - Date.parse(segs[i].arrivalAt)) / 60_000),
      ),
    });
  }
  return out;
}
