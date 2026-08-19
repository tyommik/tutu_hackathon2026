import { describe, expect, it } from "vitest";
import { bestVia, hubCandidates, rankTransfers } from "./transfers";
import type { OfferSnapshot } from "./trip";

function offer(dep: string, arr: string, price: number): OfferSnapshot {
  return {
    offerId: `${dep}-${price}`,
    price,
    currency: "RUB",
    carriers: ["X"],
    departureAt: dep,
    arrivalAt: arr,
    mode: "avia",
    checkoutRef: {},
  };
}

describe("hubCandidates", () => {
  it("город маршрута хабом не предлагает", () => {
    const hubs = hubCandidates("Москва", "Стамбул");
    expect(hubs).not.toContain("Москва");
    expect(hubs).not.toContain("Стамбул");
  });

  it("регистр и форма записи не мешают", () => {
    expect(hubCandidates("москва", "дубай")).not.toContain("Дубай");
  });

  it("ограничивает список: каждый хаб — это два запроса к Туту", () => {
    expect(hubCandidates("Воронеж", "Денпасар", 3)).toHaveLength(3);
  });

  it("принимает пул от LLM: фильтрует концы плеча и дубли", () => {
    const pool = ["Новосибирск", "Воронеж", "Новосибирск", "Москва"];
    expect(hubCandidates("Горно-Алтайск", "Воронеж", 5, pool)).toEqual([
      "Новосибирск",
      "Москва",
    ]);
  });
});

describe("bestVia", () => {
  const firsts = [
    offer("2026-09-15T08:00:00+03:00", "2026-09-15T09:30:00+03:00", 5000),
    offer("2026-09-15T18:00:00+03:00", "2026-09-15T19:30:00+03:00", 4000),
  ];

  it("берёт самую дешёвую пару, на которую успеваем", () => {
    const seconds = [
      offer("2026-09-15T21:30:00+03:00", "2026-09-16T12:00:00+07:00", 40000),
      offer("2026-09-15T12:00:00+03:00", "2026-09-16T03:00:00+07:00", 42000),
    ];
    const best = bestVia("Москва", firsts, seconds)!;
    expect(best.totalPrice).toBe(44000);
    expect(best.first.price).toBe(4000);
    expect(best.layoverMin).toBe(120);
  });

  it("стыковку в 30 минут вариантом не считает", () => {
    // прилёт 19:30, вылет 20:00 — на бумаге стыкуется, в жизни нет
    const late = [firsts[1]];
    const seconds = [offer("2026-09-15T20:00:00+03:00", "2026-09-16T10:00:00+07:00", 30000)];
    expect(bestVia("Москва", late, seconds)).toBeNull();
  });

  it("второе плечо на следующий день — нормальный вариант", () => {
    const seconds = [offer("2026-09-16T09:00:00+03:00", "2026-09-16T23:00:00+07:00", 30000)];
    const best = bestVia("Москва", firsts, seconds)!;
    expect(best.secondDate).toBe("2026-09-16");
    expect(best.layoverMin).toBeGreaterThan(600);
  });

  it("без офферов на одном из плеч варианта нет", () => {
    expect(bestVia("Москва", firsts, [])).toBeNull();
    expect(bestVia("Москва", [], [offer("2026-09-15T20:00:00+03:00", "2026-09-16T10:00:00+07:00", 1)])).toBeNull();
  });
});

describe("rankTransfers", () => {
  it("дешевле — выше; при равной цене выигрывает быстрый", () => {
    const mk = (hub: string, totalPrice: number, totalMin: number) =>
      ({ hub, totalPrice, totalMin }) as never;
    const sorted = rankTransfers([mk("A", 50, 100), mk("B", 40, 900), mk("C", 40, 300)]);
    expect(sorted.map((o) => o.hub)).toEqual(["C", "B", "A"]);
  });
});
