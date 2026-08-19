import { describe, expect, it } from "vitest";
import {
  buildTripContext,
  draftSummary,
  todayContext,
  validateDraft,
  validateParty,
  validateTransferAction,
} from "./assist";
import type { Trip } from "./trip";

describe("todayContext", () => {
  it("даёт ISO-дату, человеческую формулировку и горизонт продаж", () => {
    const s = todayContext(new Date(2026, 7, 17, 12, 0, 0));
    expect(s).toContain("Сегодня: 2026-08-17");
    expect(s).toContain("августа 2026");
    expect(s).toContain("2026-11-15"); // +90 дней
    expect(s).toContain("прошедшие даты не предлагай");
  });
});

describe("buildTripContext", () => {
  it("пустой план", () => {
    expect(buildTripContext({ legs: [], stays: [] })).toBe("План пока пуст.");
  });

  it("включает плечи, отели, предупреждения и бюджет", () => {
    const trip: Trip = {
      legs: [
        {
          id: "a", from: { name: "Барселона" }, to: { name: "Москва" }, date: "2026-09-20", mode: "avia",
          selectedOffer: {
            offerId: "1", price: 23022, currency: "RUB", carriers: ["Pegasus"],
            departureAt: "2026-09-20T09:40:00+02:00", arrivalAt: "2026-09-20T19:25:00+03:00",
            mode: "avia", checkoutRef: {},
          },
        },
        {
          id: "b", from: { name: "Москва" }, to: { name: "Оскол" }, date: "2026-09-20", mode: "rail",
          selectedOffer: {
            offerId: "2", price: 3075, currency: "RUB", carriers: ["ФПК"],
            departureAt: "2026-09-20T18:05:00+03:00", arrivalAt: "2026-09-21T05:48:00+03:00",
            mode: "rail", checkoutRef: {},
          },
        },
      ],
      stays: [
        {
          city: { name: "Стамбул" }, checkin: "2026-09-11", checkout: "2026-09-13", nights: 2,
          selectedHotel: { hotelId: "h", name: "Agora Life", price: 28228, currency: "RUB", checkoutRef: {} },
        },
      ],
    };
    const ctx = buildTripContext(trip);
    expect(ctx).toContain("Барселона → Москва (avia, 23022 ₽");
    expect(ctx).toContain("отель в Стамбул");
    expect(ctx).toContain("! стыковка: Не успеваете");
    expect(ctx).toContain("Итого бюджет плана: 54325 ₽");
  });
});

describe("validateDraft", () => {
  it("принимает корректный черновик и нормализует mode", () => {
    const legs = validateDraft({
      legs: [
        { from: "Оскол", to: "Москва", date: "2026-09-10", mode: "rail" },
        { from: "Москва", to: "Стамбул", date: "2026-09-11", mode: "чартер" },
      ],
    });
    expect(legs).toHaveLength(2);
    expect(legs![0].mode).toBe("rail");
    expect(legs![1].mode).toBe("any");
  });

  it("отклоняет мусор: без legs, кривые даты, пустые города, оверсайз", () => {
    expect(validateDraft(null)).toBeNull();
    expect(validateDraft({})).toBeNull();
    expect(validateDraft({ legs: [] })).toBeNull();
    expect(validateDraft({ legs: [{ from: "A", to: "B", date: "10.09.2026" }] })).toBeNull();
    expect(validateDraft({ legs: [{ from: "", to: "B", date: "2026-09-10" }] })).toBeNull();
    expect(
      validateDraft({ legs: Array.from({ length: 15 }, () => ({ from: "A", to: "B", date: "2026-09-10" })) }),
    ).toBeNull();
  });
});

describe("validateTransferAction", () => {
  it("принимает плечо и необязательный хаб", () => {
    expect(validateTransferAction({ from: "Москва", to: "Бостон", hub: "Стамбул" })).toEqual({
      from: "Москва",
      to: "Бостон",
      hub: "Стамбул",
    });
    expect(validateTransferAction({ from: "Москва", to: "Бостон" })).toEqual({
      from: "Москва",
      to: "Бостон",
    });
  });

  it("отклоняет мусор: пустые города, не-строки, не-объект", () => {
    expect(validateTransferAction(null)).toBeNull();
    expect(validateTransferAction({ from: "", to: "Бостон" })).toBeNull();
    expect(validateTransferAction({ from: "Москва" })).toBeNull();
    expect(validateTransferAction({ from: 1, to: "Бостон" })).toBeNull();
  });

  it("хаб-мусор молча отбрасывается, действие остаётся", () => {
    expect(validateTransferAction({ from: "Москва", to: "Бостон", hub: 7 })).toEqual({
      from: "Москва",
      to: "Бостон",
    });
  });
});

describe("validateParty", () => {
  it("берёт состав из черновика: «вдвоём с ребёнком 5 лет»", () => {
    expect(validateParty({ adults: 2, children_ages: [5] })).toEqual({
      adults: 2,
      childrenAges: [5],
    });
  });

  it("состав не назван — прежний остаётся (undefined)", () => {
    expect(validateParty({ legs: [] })).toBeUndefined();
    expect(validateParty(null)).toBeUndefined();
    expect(validateParty({ adults: "двое" })).toBeUndefined();
  });

  it("невозможные значения выбрасывает, а не верит модели", () => {
    expect(validateParty({ adults: 0 })).toBeUndefined();
    expect(validateParty({ adults: 99 })).toBeUndefined();
    expect(validateParty({ adults: 2, children_ages: [5, 30, -1, 12.5] })).toEqual({
      adults: 2,
      childrenAges: [5],
    });
  });

  it("дети без взрослых — взрослый всё равно один", () => {
    expect(validateParty({ children_ages: [7] })).toEqual({ adults: 1, childrenAges: [7] });
  });
});

describe("draftSummary", () => {
  const today = new Date("2026-08-19T12:00:00Z");
  const leg = (from: string, to: string, date: string) => ({ from, to, date, mode: "any" as const });

  it("одно плечо: маршрут и дата, год нынешний — не пишем", () => {
    expect(draftSummary([leg("Воронеж", "Барселона", "2026-09-15")], today)).toBe(
      "Собрал черновик: Воронеж → Барселона, 15 сентября. Даты и города правятся в плане.",
    );
  });

  it("год не нынешний — год обязателен: иначе «15 июня» звучит как через месяц", () => {
    expect(draftSummary([leg("Воронеж", "Барселона", "2027-06-15")], today)).toContain("15 июня 2027");
  });

  it("цепочка через хаб в один день — одна дата", () => {
    expect(
      draftSummary(
        [leg("Москва", "Горно-Алтайск", "2026-09-15"), leg("Горно-Алтайск", "Манжерок", "2026-09-15")],
        today,
      ),
    ).toBe("Собрал черновик: Москва → Горно-Алтайск → Манжерок, 15 сентября. Даты и города правятся в плане.");
  });

  it("разные даты внутри месяца сжимаются в диапазон", () => {
    expect(
      draftSummary([leg("Москва", "Сочи", "2026-09-15"), leg("Сочи", "Москва", "2026-09-20")], today),
    ).toContain("15–20 сентября");
  });

  it("даты в разных месяцах пишутся полностью", () => {
    expect(
      draftSummary([leg("Москва", "Сочи", "2026-12-28"), leg("Сочи", "Москва", "2027-01-05")], today),
    ).toContain("28 декабря — 5 января 2027");
  });

  it("длинный маршрут сворачивается и считает плечи по-русски", () => {
    const legs = [
      leg("Москва", "Казань", "2026-09-01"),
      leg("Казань", "Уфа", "2026-09-03"),
      leg("Уфа", "Пермь", "2026-09-05"),
      leg("Пермь", "Киров", "2026-09-07"),
      leg("Киров", "Тверь", "2026-09-09"),
      leg("Тверь", "Москва", "2026-09-11"),
    ];
    const out = draftSummary(legs, today);
    expect(out).toContain("Москва → … → Москва, 6 плеч");
    expect(out).not.toContain("Казань");
  });

  it("счётчик плеч на всём допустимом диапазоне", () => {
    const chain = (n: number) =>
      Array.from({ length: n }, (_, i) => leg(`Г${i}`, `Г${i + 1}`, "2026-09-01"));
    // до семи городов маршрут пишется целиком — счётчик появляется дальше
    expect(draftSummary(chain(6), today)).toContain("6 плеч");
    expect(draftSummary(chain(7), today)).toContain("7 плеч");
    expect(draftSummary(chain(11), today)).toContain("11 плеч");
    expect(draftSummary(chain(12), today)).toContain("12 плеч");
    expect(draftSummary(chain(14), today)).toContain("14 плеч");
  });
});
