import { describe, expect, it } from "vitest";
import { timeWindows } from "./windows";
import { deriveStays, stayKey, type Leg, type OfferSnapshot } from "./trip";

function offer(dep: string, arr: string): OfferSnapshot {
  return {
    offerId: dep,
    price: 1000,
    currency: "RUB",
    carriers: [],
    departureAt: dep,
    arrivalAt: arr,
    mode: "avia",
    checkoutRef: {},
  };
}

function leg(id: string, from: string, to: string, date: string, o?: OfferSnapshot): Leg {
  return { id, from: { name: from }, to: { name: to }, date, mode: "any", selectedOffer: o };
}

describe("timeWindows", () => {
  it("поздний заезд и ранний выезд прикрепляются к ночёвке", () => {
    const legs = [
      leg("l1", "Лиссабон", "Мадрид", "2026-09-17", offer("2026-09-17T12:45:00+01:00", "2026-09-17T21:15:00+02:00")),
      leg("l2", "Мадрид", "Барселона", "2026-09-18", offer("2026-09-18T07:30:00+02:00", "2026-09-18T10:00:00+02:00")),
    ];
    const stays = deriveStays(legs);
    const notes = timeWindows(legs, stays);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({ kind: "late-arrival", target: stayKey(stays[0]) });
    expect(notes[0].message).toContain("21:15");
    expect(notes[1]).toMatchObject({ kind: "early-departure", target: stayKey(stays[0]) });
  });

  it("дневная пересадка без ночёвки от 3 часов — long-transfer на следующем плече", () => {
    const legs = [
      leg("l1", "Оскол", "Москва", "2026-09-10", offer("2026-09-10T18:50:00+03:00", "2026-09-11T05:55:00+03:00")),
      leg("l2", "Москва", "Стамбул", "2026-09-11", offer("2026-09-11T13:00:00+03:00", "2026-09-11T18:15:00+03:00")),
    ];
    const notes = timeWindows(legs, deriveStays(legs));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "long-transfer", target: "l2" });
    expect(notes[0].message).toContain("в Москве");
    expect(notes[0].message).toContain("7 ч 5 мин");
    // город и длина окна — из них карточка собирает вопрос копилоту
    expect(notes[0]).toMatchObject({ city: "Москва", minutes: 425 });
  });

  it("короткая пересадка и нормальные времена — тишина", () => {
    const legs = [
      leg("l1", "A", "B", "2026-09-10", offer("2026-09-10T10:00:00+03:00", "2026-09-10T12:00:00+03:00")),
      leg("l2", "B", "C", "2026-09-10", offer("2026-09-10T14:00:00+03:00", "2026-09-10T16:00:00+03:00")),
    ];
    expect(timeWindows(legs, deriveStays(legs))).toHaveLength(0);
  });

  it("плечи без офферов пропускаются", () => {
    const legs = [leg("l1", "A", "B", "2026-09-10"), leg("l2", "B", "C", "2026-09-11")];
    expect(timeWindows(legs, [])).toHaveLength(0);
  });
});
