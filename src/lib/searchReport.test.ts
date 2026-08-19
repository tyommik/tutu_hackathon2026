import { describe, expect, it } from "vitest";
import { searchReport } from "./searchReport";
import type { Leg, OfferSnapshot, Stay } from "./trip";

const leg = (
  id: string,
  from: string,
  to: string,
  date: string,
  offer?: Partial<OfferSnapshot>,
): Leg =>
  ({
    id,
    from: { name: from },
    to: { name: to },
    date,
    mode: "any",
    ...(offer ? { selectedOffer: offer as OfferSnapshot } : {}),
  }) as Leg;

const stay = (
  city: string,
  checkin: string,
  checkout: string,
  nights: number,
  hotel?: { name: string; price: number },
): Stay =>
  ({
    city: { name: city },
    checkin,
    checkout,
    nights,
    ...(hotel ? { selectedHotel: hotel } : {}),
  }) as Stay;

describe("searchReport", () => {
  it("собирает полную картину: найденные плечи, пересадки, пустоты, отели, итог", () => {
    const legs = [
      leg("a", "Белгород", "Москва", "2026-09-21", { mode: "rail", price: 4800 }),
      leg("b", "Москва", "Белград", "2026-09-22"),
      leg("c", "Белград", "Афины", "2026-09-24"),
    ];
    const stays = [
      stay("Белград", "2026-09-22", "2026-09-24", 2, { name: "Hotel Moskva", price: 25669 }),
      stay("Афины", "2026-09-24", "2026-09-26", 2),
    ];
    const transfers = {
      b: { loading: false, options: [{ hub: "Стамбул", totalPrice: 119748 }] },
      c: { loading: false, options: [] },
    };

    expect(searchReport(legs, stays, transfers, 131446)).toBe(
      [
        "Автоотчёт: поиск по черновику завершён.",
        "Плечи:",
        "- 2026-09-21 Белгород → Москва: поезд, 4 800 ₽",
        "- 2026-09-22 Москва → Белград: прямых вариантов нет; есть пересадка через Стамбул за 119 748 ₽ — применяется одной кнопкой в плане",
        "- 2026-09-24 Белград → Афины: вариантов не нашлось",
        "Отели:",
        "- Белград, 2 ноч. (2026-09-22..2026-09-24): Hotel Moskva, 25 669 ₽",
        "- Афины, 2 ноч. (2026-09-24..2026-09-26): не нашлось",
        "Итого по плану: 131 446 ₽.",
      ].join("\n"),
    );
  });

  it("плечо без офферов и без записи о пересадке — просто «не нашлось»", () => {
    const legs = [leg("a", "Москва", "Марс", "2026-09-21")];
    expect(searchReport(legs, [], {}, 0)).toContain(
      "- 2026-09-21 Москва → Марс: вариантов не нашлось",
    );
  });

  it("без отелей секция «Отели» не печатается", () => {
    const legs = [leg("a", "Москва", "Казань", "2026-09-21", { mode: "avia", price: 5000 })];
    const report = searchReport(legs, [], {}, 5000);
    expect(report).not.toContain("Отели:");
    expect(report).toContain("- 2026-09-21 Москва → Казань: авиа, 5 000 ₽");
  });
});
