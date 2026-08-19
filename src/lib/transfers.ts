/**
 * Подбор пересадки для плеча, на которое ничего не нашлось.
 *
 * Сквозного рейса может не быть вовсе (нет аэропорта у города, нет
 * маркетингового соединения у перевозчиков) — тогда единственный способ
 * долететь — собрать маршрут из двух плеч через хаб. Здесь чистая часть:
 * какие хабы пробовать и как из пар офферов собрать варианты.
 */

import { MIN_TRANSFER_MIN } from "./repair";
import { slug, type OfferSnapshot } from "./trip";

/** Хабы, через которые Туту реально продаёт стыковки. */
export const HUBS = [
  "Москва",
  "Стамбул",
  "Дубай",
  "Санкт-Петербург",
  "Ереван",
  "Белград",
  "Алматы",
  "Абу-Даби",
];

/**
 * Хабы-кандидаты для пары городов: сам город отправления или прибытия
 * хабом быть не может, остальное — в порядке полезности. pool — список
 * кандидатов (по умолчанию статический HUBS, но может прийти от LLM,
 * см. hubSuggest.ts), дубли в нём срезаем.
 */
export function hubCandidates(from: string, to: string, limit = 5, pool = HUBS): string[] {
  const taken = new Set([slug(from), slug(to)]);
  const out: string[] = [];
  for (const h of pool) {
    const s = slug(h);
    if (taken.has(s)) continue;
    taken.add(s);
    out.push(h);
  }
  return out.slice(0, limit);
}

export interface TransferOption {
  hub: string;
  first: OfferSnapshot;
  second: OfferSnapshot;
  /** Дата второго плеча — может быть следующим днём. */
  secondDate: string;
  totalPrice: number;
  /** Минуты между прилётом в хаб и вылетом из него. */
  layoverMin: number;
  /** Общее время в пути с учётом ожидания. */
  totalMin: number;
}

/**
 * Лучший вариант через один хаб: самый дешёвый второй оффер, на который
 * успеваем от самого дешёвого первого. Стыковка меньше MIN_TRANSFER_MIN —
 * не вариант, а ловушка.
 */
export function bestVia(
  hub: string,
  firsts: OfferSnapshot[],
  seconds: OfferSnapshot[],
  minTransferMin = MIN_TRANSFER_MIN,
): TransferOption | null {
  let best: TransferOption | null = null;
  for (const a of firsts) {
    const arrival = Date.parse(a.arrivalAt);
    for (const b of seconds) {
      const layoverMin = Math.round((Date.parse(b.departureAt) - arrival) / 60_000);
      if (layoverMin < minTransferMin) continue;
      const totalPrice = a.price + b.price;
      if (best && totalPrice >= best.totalPrice) continue;
      best = {
        hub,
        first: a,
        second: b,
        secondDate: b.departureAt.slice(0, 10),
        layoverMin,
        totalPrice,
        totalMin: Math.round((Date.parse(b.arrivalAt) - Date.parse(a.departureAt)) / 60_000),
      };
    }
  }
  return best;
}

/** Дешёвые и осмысленные варианты вперёд. */
export function rankTransfers(options: TransferOption[]): TransferOption[] {
  return [...options].sort((x, y) => x.totalPrice - y.totalPrice || x.totalMin - y.totalMin);
}
