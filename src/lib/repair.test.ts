import { describe, expect, it } from "vitest";
import { firstFeasible, planRepairs, MAX_AUTO_SHIFTS } from "./repair";
import type { Leg, OfferSnapshot } from "./trip";

function offer(dep: string, arr: string, price: number): OfferSnapshot {
  return {
    offerId: `${dep}@${price}`,
    price,
    currency: "RUB",
    carriers: [],
    departureAt: dep,
    arrivalAt: arr,
    mode: "avia",
    checkoutRef: {},
  };
}

function leg(id: string, date: string, o?: OfferSnapshot, extra: Partial<Leg> = {}): Leg {
  return {
    id,
    from: { name: "A" },
    to: { name: "B" },
    date,
    mode: "any",
    selectedOffer: o,
    ...extra,
  };
}

// Сценарий из бага: автобус Оскол→Москва 12.09 20:50 → 13.09 05:40,
// рейс Москва→Дубай выбран на 12.09 23:25 — раньше прибытия.
const BUS = offer("2026-09-12T20:50:00+03:00", "2026-09-13T05:40:00+03:00", 1900);
const FLIGHT_BAD = offer("2026-09-12T23:25:00+03:00", "2026-09-13T07:00:00+04:00", 24089);
const FLIGHT_OK = offer("2026-09-13T09:30:00+03:00", "2026-09-13T16:10:00+04:00", 26500);

describe("firstFeasible", () => {
  it("выбирает самый дешёвый из тех, на кого успеваем (с буфером)", () => {
    const pool = [FLIGHT_BAD, FLIGHT_OK];
    const fix = firstFeasible(pool, BUS.arrivalAt);
    expect(fix?.offerId).toBe(FLIGHT_OK.offerId);
  });

  it("рейс через 30 минут после прибытия не проходит по буферу 90 мин", () => {
    const tight = offer("2026-09-13T06:10:00+03:00", "2026-09-13T12:00:00+04:00", 20000);
    expect(firstFeasible([tight], BUS.arrivalAt)).toBeUndefined();
  });
});

describe("planRepairs", () => {
  it("конфликт + есть выполнимый в пуле → pick", () => {
    const legs = [leg("l1", "2026-09-12", BUS), leg("l2", "2026-09-12", FLIGHT_BAD)];
    const actions = planRepairs(legs, { l2: [FLIGHT_BAD, FLIGHT_OK] });
    expect(actions).toEqual([{ kind: "pick", legId: "l2", offer: FLIGHT_OK }]);
  });

  it("конфликт + пул пуст → shift на дату прибытия предыдущего плеча", () => {
    const legs = [leg("l1", "2026-09-12", BUS), leg("l2", "2026-09-12", FLIGHT_BAD)];
    const actions = planRepairs(legs, { l2: [FLIGHT_BAD] });
    expect(actions).toEqual([{ kind: "shift", legId: "l2", newDate: "2026-09-13" }]);
  });

  it("pinned-оффер не трогаем даже при конфликте", () => {
    const legs = [leg("l1", "2026-09-12", BUS), leg("l2", "2026-09-12", FLIGHT_BAD, { pinned: true })];
    expect(planRepairs(legs, { l2: [FLIGHT_BAD, FLIGHT_OK] })).toEqual([]);
  });

  it("после MAX_AUTO_SHIFTS сдвигов сдаёмся (warning остаётся)", () => {
    const legs = [
      leg("l1", "2026-09-12", BUS),
      leg("l2", "2026-09-12", FLIGHT_BAD, { autoShifts: MAX_AUTO_SHIFTS }),
    ];
    expect(planRepairs(legs, { l2: [FLIGHT_BAD] })).toEqual([]);
  });

  it("без конфликта — пусто", () => {
    const legs = [leg("l1", "2026-09-12", BUS), leg("l2", "2026-09-13", FLIGHT_OK)];
    expect(planRepairs(legs, {})).toEqual([]);
  });

  it("плечо без оффера прерывает цепочку проверок, а не роняет её", () => {
    const legs = [leg("l1", "2026-09-12", BUS), leg("l2", "2026-09-12"), leg("l3", "2026-09-12", FLIGHT_BAD)];
    expect(planRepairs(legs, {})).toEqual([]);
  });

  it("pick чинит цепочку дальше: следующее плечо проверяется от нового прибытия", () => {
    const next = offer("2026-09-13T18:30:00+04:00", "2026-09-13T21:00:00+04:00", 5000);
    const nextBad = offer("2026-09-13T10:00:00+04:00", "2026-09-13T12:00:00+04:00", 3000);
    const legs = [
      leg("l1", "2026-09-12", BUS),
      leg("l2", "2026-09-12", FLIGHT_BAD),
      leg("l3", "2026-09-13", nextBad),
    ];
    // l2 чинится на FLIGHT_OK (прибытие 16:10 +04) → l3 в 10:00 уже не успевает → тоже чинится
    const actions = planRepairs(legs, { l2: [FLIGHT_BAD, FLIGHT_OK], l3: [nextBad, next] });
    expect(actions).toEqual([
      { kind: "pick", legId: "l2", offer: FLIGHT_OK },
      { kind: "pick", legId: "l3", offer: next },
    ]);
  });
});
