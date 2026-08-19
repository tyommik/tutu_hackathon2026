/**
 * Окна времени (stretch из дизайн-дока): подсказки о качестве стыков плана —
 * поздний заезд, ранний выезд, длинные дневные пересадки без ночёвки.
 * Поверх инварианта стыковок: тот ловит невозможное, эти — неудобное.
 */

import { inCity } from "./morph";
import { cityId, formatMinutes, localDate, stayKey, type Leg, type Stay } from "./trip";

export interface TimeWindowNote {
  /** к чему прикрепить: leg id или stay key */
  target: string;
  kind: "late-arrival" | "early-departure" | "long-transfer";
  message: string;
  /** Город свободного времени — по нему карточка спрашивает копилота. */
  city?: string;
  /** Длина окна, минуты (для long-transfer). */
  minutes?: number;
}

const LATE_HOUR = 21;
const EARLY_HOUR = 8;
/** от 3 часов дневного окна — уже «пересадка с временем», о ней стоит сказать */
const TRANSFER_MIN = 3 * 60;

function hourOf(iso: string): number {
  return Number(iso.slice(11, 13));
}

export function timeWindows(legs: Leg[], stays: Stay[]): TimeWindowNote[] {
  const notes: TimeWindowNote[] = [];
  const stayByCity = new Map(stays.map((s) => [`${cityId(s.city)}:${s.checkin}`, s]));

  for (let i = 0; i < legs.length - 1; i++) {
    const a = legs[i].selectedOffer;
    const b = legs[i + 1].selectedOffer;
    if (!a || !b) continue;

    const stay = stayByCity.get(`${cityId(legs[i].to)}:${localDate(a.arrivalAt)}`);

    if (stay) {
      if (hourOf(a.arrivalAt) >= LATE_HOUR) {
        notes.push({
          target: stayKey(stay),
          kind: "late-arrival",
          message: `заезд в ${a.arrivalAt.slice(11, 16)} — первый вечер короткий`,
        });
      }
      if (hourOf(b.departureAt) < EARLY_HOUR) {
        notes.push({
          target: stayKey(stay),
          kind: "early-departure",
          message: `выезд в ${b.departureAt.slice(11, 16)} — ранний подъём в день отъезда`,
        });
      }
      continue;
    }

    // ночёвки нет: дневное окно между прибытием и отправлением
    const gapMin = Math.round((Date.parse(b.departureAt) - Date.parse(a.arrivalAt)) / 60_000);
    if (gapMin >= TRANSFER_MIN) {
      notes.push({
        target: legs[i + 1].id,
        kind: "long-transfer",
        message: `${formatMinutes(gapMin)} свободного времени ${inCity(legs[i].to.name)} — успеете прогуляться`,
        city: legs[i].to.name,
        minutes: gapMin,
      });
    }
  }
  return notes;
}
