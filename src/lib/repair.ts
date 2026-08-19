/**
 * Авто-ремонт стыковок. Проблема-первопричина: автопоиск выбирал офферы
 * плеч независимо, и «дешёвый» рейс мог улетать раньше, чем приезжает
 * предыдущее плечо (Оскол → Москва автобусом к 05:40 13.09, а рейс в Дубай
 * выбран на 23:25 12.09). Система должна не только предупреждать, но и
 * чинить: выбирать выполнимый оффер, а если в этот день уже не успеть —
 * сдвигать дату плеча и пере-искать.
 */

import { localDate, type Leg, type OfferSnapshot } from "./trip";

/** Минимальный запас на пересадку, минуты. */
export const MIN_TRANSFER_MIN = 90;
/** Максимум автоматических сдвигов даты одного плеча. */
export const MAX_AUTO_SHIFTS = 2;

export type RepairAction =
  | { kind: "pick"; legId: string; offer: OfferSnapshot }
  | { kind: "shift"; legId: string; newDate: string };

/**
 * Самый дешёвый оффер, на который успеваем после прибытия prevArrivalAt
 * (offers уже отсортированы по цене — берём первый подходящий).
 */
export function firstFeasible(
  offers: OfferSnapshot[],
  prevArrivalAt: string,
  bufferMin = MIN_TRANSFER_MIN,
): OfferSnapshot | undefined {
  const minDepart = Date.parse(prevArrivalAt) + bufferMin * 60_000;
  return offers.find((o) => Date.parse(o.departureAt) >= minDepart);
}

function nextDate(cur: string, prevArrivalAt: string): string {
  const arrivalDate = localDate(prevArrivalAt);
  if (arrivalDate > cur) return arrivalDate;
  const d = new Date(`${cur}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Проходит плечи по порядку и возвращает список починок:
 * - pick: в пуле офферов плеча есть выполнимый — перевыбрать;
 * - shift: в ЗАГРУЖЕННОМ пуле выполнимых нет. Стор интерпретирует shift
 *   мягко: сначала широкий пере-поиск того же дня (pageSize 30), и только
 *   если и там пусто — реальный сдвиг даты (не дальше MAX_AUTO_SHIFTS раз).
 * Плечи с pinned-оффером (ручной выбор) не трогаем — там остаётся warning.
 */
export function planRepairs(
  legs: Leg[],
  offersByLeg: Record<string, OfferSnapshot[] | undefined>,
  bufferMin = MIN_TRANSFER_MIN,
): RepairAction[] {
  const actions: RepairAction[] = [];
  // виртуальное «прибытие» предыдущего плеча с учётом уже запланированных починок
  let prevArrival: string | undefined;

  for (const leg of legs) {
    const offer = leg.selectedOffer;
    if (!offer) {
      // плечо ещё ищется — дальше стыковки проверит следующий прогон
      prevArrival = undefined;
      continue;
    }
    if (!prevArrival) {
      prevArrival = offer.arrivalAt;
      continue;
    }
    const minDepart = Date.parse(prevArrival) + bufferMin * 60_000;
    if (Date.parse(offer.departureAt) >= minDepart) {
      prevArrival = offer.arrivalAt;
      continue;
    }
    if (leg.pinned) {
      // пользователь выбрал сам — уважаем, предупреждение покажет UI
      prevArrival = offer.arrivalAt;
      continue;
    }
    const fix = firstFeasible(offersByLeg[leg.id] ?? [], prevArrival, bufferMin);
    if (fix) {
      actions.push({ kind: "pick", legId: leg.id, offer: fix });
      prevArrival = fix.arrivalAt;
      continue;
    }
    if ((leg.autoShifts ?? 0) < MAX_AUTO_SHIFTS) {
      actions.push({ kind: "shift", legId: leg.id, newDate: nextDate(leg.date, prevArrival) });
      // дата сдвинута — оффер будет пере-искаться, дальше не проверяем
      prevArrival = undefined;
      continue;
    }
    prevArrival = offer.arrivalAt;
  }
  return actions;
}
