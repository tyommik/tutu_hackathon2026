import { describe, expect, it } from "vitest";
import { extraId, extrasAfter, extrasTotal, makeExtra, unconvertedExtras, type Extra } from "./extras";
import { parseCbrXml, toRub } from "./rates";

const rates = parseCbrXml(
  `<ValCurs Date="2026-08-18"><Valute><CharCode>EUR</CharCode><Nominal>1</Nominal><Value>93,2500</Value></Valute></ValCurs>`,
);

describe("makeExtra", () => {
  it("такси 40 € превращается в рубли и помнит курс", () => {
    const e = makeExtra(
      { label: "Такси", amount: 40, currency: "eur", afterId: "leg-1" },
      toRub(40, "EUR", rates),
    );
    expect(e.currency).toBe("EUR");
    expect(e.rub).toBeCloseTo(3730, 2);
    expect(e.rate).toBeCloseTo(93.25, 4);
    expect(e.rateDate).toBe("18.08.2026".split(".").reverse().join("-"));
  });

  it("без курса сумма сохраняется, но рублей нет — не выдумываем", () => {
    const e = makeExtra({ label: "Такси", amount: 40, currency: "ZZZ", afterId: "leg-1" }, null);
    expect(e.amount).toBe(40);
    expect(e.rub).toBeUndefined();
  });

  it("пустое название не оставляем пустым", () => {
    expect(makeExtra({ label: "  ", amount: 1, currency: "RUB", afterId: "x" }, null).label).toBe(
      "Расход",
    );
  });

  it("id не сталкивается с уже занятыми", () => {
    expect(extraId(new Set(["extra-1", "extra-2"]))).toBe("extra-3");
  });
});

describe("суммы", () => {
  const extras: Extra[] = [
    { id: "1", label: "Такси", amount: 40, currency: "EUR", rub: 3730, afterId: "a" },
    { id: "2", label: "Виза", amount: 500, currency: "RUB", rub: 500, afterId: "b" },
    { id: "3", label: "Чаевые", amount: 20, currency: "ZZZ", afterId: "a" },
  ];

  it("считает только пересчитанное", () => {
    expect(extrasTotal(extras)).toBe(4230);
  });

  it("непересчитанные видно отдельно", () => {
    expect(unconvertedExtras(extras).map((e) => e.id)).toEqual(["3"]);
  });

  it("траты группируются по карточке", () => {
    expect(extrasAfter(extras, "a").map((e) => e.id)).toEqual(["1", "3"]);
    expect(extrasAfter(extras, "нет такой")).toEqual([]);
  });
});
