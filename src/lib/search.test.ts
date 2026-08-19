import { describe, expect, it } from "vitest";
import { seatsFor, toSnapshot } from "./search";
import type { Party } from "./trip";

const solo: Party = { adults: 1, childrenAges: [] };
const family: Party = { adults: 2, childrenAges: [5] };
const withTeen: Party = { adults: 2, childrenAges: [14, 5, 1] };

/** Минимальный сырой оффер в форме, в которой его отдаёт Туту. */
const offer = (transport: "avia" | "railway" | "bus" | "etrain", amount: number) => ({
  offer_id: `${transport}-1`,
  transport,
  price: { amount, currency: "RUB" },
  departure_at: "2026-09-15T08:00:00+03:00",
  arrival_at: "2026-09-15T12:00:00+03:00",
});

describe("seatsFor", () => {
  it("авиа и автобус уже посчитаны на всю партию — множитель 1", () => {
    for (const p of [solo, family, withTeen]) {
      expect(seatsFor("avia", p)).toBe(1);
      expect(seatsFor("bus", p)).toBe(1);
    }
  });

  it("ж/д и электричка идут за место — множитель равен числу мест", () => {
    expect(seatsFor("rail", solo)).toBe(1);
    expect(seatsFor("rail", family)).toBe(2);
    expect(seatsFor("etrain", family)).toBe(2);
  });

  it("подросток 12+ занимает место, младшие дети в запрос не уходят", () => {
    // search_rail принимает только число пассажиров, search_etrain — ничего;
    // считаем ровно тех, кого запрашиваем, иначе бюджет разойдётся с поиском
    expect(seatsFor("rail", withTeen)).toBe(3);
  });

  it("нулевого множителя не бывает даже на пустом составе", () => {
    expect(seatsFor("rail", { adults: 0, childrenAges: [] })).toBe(1);
  });
});

describe("toSnapshot: приведение цены к стоимости за всю поездку", () => {
  it("авиа остаётся как есть", () => {
    expect(toSnapshot(offer("avia", 12_696), family).price).toBe(12_696);
  });

  it("ж/д умножается на число мест", () => {
    expect(toSnapshot(offer("railway", 1_141), family).price).toBe(2_282);
  });

  it("электричка умножается на число мест", () => {
    expect(toSnapshot(offer("etrain", 668), withTeen).price).toBe(2_004);
  });

  it("без состава ничего не умножается — поведение для одного пассажира", () => {
    expect(toSnapshot(offer("railway", 1_141)).price).toBe(1_141);
  });

  it("варианты тарифов приводятся тем же множителем", () => {
    const raw = {
      ...offer("railway", 1_141),
      variants: [
        { variant_id: "plackart", price: { amount: 1_141, currency: "RUB" } },
        { variant_id: "kupe", price: { amount: 3_400, currency: "RUB" } },
        // вариант без своей цены наследует цену оффера — тоже за место
        { variant_id: "same" },
      ],
    };
    expect(toSnapshot(raw, family).variants?.map((v) => v.price)).toEqual([2_282, 6_800, 2_282]);
  });

  it("сравнение поезда и самолёта на семью перестаёт врать", () => {
    // живые числа Москва → Санкт-Петербург на 15.09.2026, трое взрослых:
    // до приведения поезд выглядел вшестеро дешевле самолёта вместо вдвое
    const trio: Party = { adults: 3, childrenAges: [] };
    const rail = toSnapshot(offer("railway", 1_141), trio).price;
    const avia = toSnapshot(offer("avia", 12_696), trio).price;
    expect(rail).toBe(3_423);
    expect(avia / rail).toBeCloseTo(3.71, 1);
  });
});
