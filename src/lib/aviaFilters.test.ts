import { describe, expect, it } from "vitest";
import { applyAviaFilters, cityOf, layovers, layoverSummary, withVariant } from "./aviaFilters";
import type { OfferSnapshot, VariantSnapshot } from "./trip";

const basic: VariantSnapshot = {
  variantId: "b", price: 18353, fareFamily: "Basic", baggagePieces: 0, baggageKg: 0, refundable: false,
};
const optimum: VariantSnapshot = {
  variantId: "o", price: 24120, fareFamily: "Optimum", baggagePieces: 1, baggageKg: 20,
  refundable: false, serviceClass: "ECONOMIC", offerHash: "HASH-OPT",
};
const flex: VariantSnapshot = {
  variantId: "f", price: 31000, fareFamily: "Flex", baggagePieces: 1, baggageKg: 20, refundable: true,
};

function offer(id: string, price: number, variants?: VariantSnapshot[], extra: Partial<OfferSnapshot> = {}): OfferSnapshot {
  return {
    offerId: id, price, currency: "RUB", carriers: ["AJet"],
    departureAt: "2026-09-11T05:05:00+03:00", arrivalAt: "2026-09-11T13:30:00+03:00",
    mode: "avia", checkoutRef: { base: 1 }, variants, ...extra,
  };
}

describe("applyAviaFilters", () => {
  const offers = [offer("a", 18353, [basic, optimum, flex]), offer("b", 20000, [{ ...basic, variantId: "b2" }])];

  it("без фильтров — базовые цены, порядок по цене", () => {
    const r = applyAviaFilters(offers, { withBaggage: false, refundable: false });
    expect(r.map((x) => x.displayPrice)).toEqual([18353, 20000]);
    expect(r[0].variant).toBeUndefined();
  });

  it("«с багажом»: оффер показывается ценой тарифа с багажом, без такого тарифа — выбывает", () => {
    const r = applyAviaFilters(offers, { withBaggage: true, refundable: false });
    expect(r).toHaveLength(1);
    expect(r[0].variant?.fareFamily).toBe("Optimum");
    expect(r[0].displayPrice).toBe(24120);
  });

  it("«с возвратом» поверх багажа — самый дешёвый возвратный тариф", () => {
    const r = applyAviaFilters(offers, { withBaggage: true, refundable: true });
    expect(r[0].variant?.fareFamily).toBe("Flex");
  });
});

describe("withVariant", () => {
  it("подменяет цену и добавляет offer_hash + service_class в checkoutRef", () => {
    const o = withVariant(offer("a", 18353, [basic, optimum]), optimum);
    expect(o.price).toBe(24120);
    expect(o.chosenFare).toBe("Optimum");
    expect(o.checkoutRef).toMatchObject({ base: 1, offer_hash: "HASH-OPT", service_class: "ECONOMIC" });
  });
});

describe("layovers", () => {
  it("вычисляет город и длительность пересадки", () => {
    const o = offer("a", 18353, undefined, {
      segmentsCount: 2,
      segments: [
        { from: "Москва — Внуково (VKO)", to: "Анкара — Эсенбога (ESB)", departureAt: "2026-09-11T05:05:00+03:00", arrivalAt: "2026-09-11T09:20:00+03:00" },
        { from: "Анкара — Эсенбога (ESB)", to: "Стамбул — Сабиха (SAW)", departureAt: "2026-09-11T11:00:00+03:00", arrivalAt: "2026-09-11T12:05:00+03:00" },
      ],
    });
    expect(layovers(o)).toEqual([{ city: "Анкара", minutes: 100 }]);
  });

  it("cityOf режет и по тире, и по запятой", () => {
    expect(cityOf("Москва — Внуково (VKO), терм. A")).toBe("Москва");
    // так Туту пишет часть аэропортов — код прилипает через запятую
    expect(cityOf("Барселона, BCN")).toBe("Барселона");
    expect(cityOf("Стамбул")).toBe("Стамбул");
  });
});

describe("layoverSummary", () => {
  const withStops = (segs: Array<[string, string, string, string]>) =>
    offer("a", 1000, undefined, {
      segmentsCount: segs.length,
      segments: segs.map(([from, to, dep, arr]) => ({
        from,
        to,
        departureAt: dep,
        arrivalAt: arr,
      })),
    });

  it("одна пересадка: город и сколько ждать", () => {
    const s = layoverSummary(
      withStops([
        ["Москва", "Стамбул", "2026-09-11T05:05:00+03:00", "2026-09-11T09:20:00+03:00"],
        ["Стамбул", "Порту", "2026-09-11T12:40:00+03:00", "2026-09-11T16:05:00+01:00"],
      ]),
    )!;
    expect(s.text).toBe("через Стамбул · пересадка 3 ч 20 мин");
    expect(s.tight).toBe(false);
    expect(s.long).toBe(false);
    expect(s.totalMinutes).toBe(200);
  });

  it("две пересадки складываются по отдельности", () => {
    const s = layoverSummary(
      withStops([
        ["Москва", "Ереван", "2026-09-11T05:00:00+03:00", "2026-09-11T08:00:00+03:00"],
        ["Ереван", "Дубай", "2026-09-11T10:00:00+03:00", "2026-09-11T14:00:00+03:00"],
        ["Дубай", "Денпасар", "2026-09-11T15:30:00+03:00", "2026-09-12T05:00:00+03:00"],
      ]),
    )!;
    expect(s.text).toBe("через Ереван, Дубай · пересадки 2 ч + 1 ч 30 мин");
    expect(s.totalMinutes).toBe(210);
  });

  it("меньше часа — узкая: бежать по терминалу", () => {
    const s = layoverSummary(
      withStops([
        ["Москва", "Стамбул", "2026-09-11T05:00:00+03:00", "2026-09-11T08:00:00+03:00"],
        ["Стамбул", "Порту", "2026-09-11T08:40:00+03:00", "2026-09-11T12:00:00+01:00"],
      ]),
    )!;
    expect(s.tight).toBe(true);
  });

  it("от шести часов — это уже день в городе", () => {
    const s = layoverSummary(
      withStops([
        ["Москва", "Стамбул", "2026-09-11T05:00:00+03:00", "2026-09-11T08:00:00+03:00"],
        ["Стамбул", "Порту", "2026-09-11T14:00:00+03:00", "2026-09-11T18:00:00+01:00"],
      ]),
    )!;
    expect(s.long).toBe(true);
    expect(s.tight).toBe(false);
  });

  it("прямой рейс подписи не получает", () => {
    expect(layoverSummary(offer("a", 1000))).toBeNull();
  });

  it("сегментов нет, но пересадка есть — не врём про города", () => {
    const s = layoverSummary(offer("a", 1000, undefined, { segmentsCount: 2 }))!;
    expect(s.text).toBe("с пересадкой");
    expect(s.totalMinutes).toBe(0);
  });
});
