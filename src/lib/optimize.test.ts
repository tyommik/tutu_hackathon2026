import { describe, expect, it } from "vitest";
import { addDays, buildCandidates, optimize, toChain, type PlanLeg, type PriceQuote } from "./optimize";
import type { Leg } from "./trip";

const c = (name: string) => ({ name });

function leg(from: string, to: string, date: string, mode: Leg["mode"] = "any"): Leg {
  return { id: `${from}-${to}-${date}`, from: c(from), to: c(to), date, mode };
}

// Оскол → Москва → Стамбул → Порту → Оскол (упрощённая легенда)
const LEGS: Leg[] = [
  leg("Оскол", "Москва", "2026-09-10", "rail"),
  leg("Москва", "Стамбул", "2026-09-11", "avia"),
  leg("Стамбул", "Порту", "2026-09-13", "avia"),
  leg("Порту", "Оскол", "2026-09-15"),
];

describe("toChain / fromChain", () => {
  it("сохраняет ритм дат при пересборке текущего порядка", () => {
    const cands = buildCandidates(LEGS);
    const current = cands[0];
    expect(current.legs.map((l) => l.date)).toEqual(["2026-09-10", "2026-09-11", "2026-09-13", "2026-09-15"]);
  });

  it("режим пары сохраняется, новые пары получают any", () => {
    const cands = buildCandidates(LEGS);
    const current = cands[0];
    expect(current.legs[0].mode).toBe("rail");
    const swapped = cands.find((x) => x.label.includes("Стамбул") && x.label.includes("Порту"))!;
    // Москва→Порту — новая пара
    expect(swapped.legs[1].mode).toBe("any");
  });

  it("при перестановке ночи путешествуют вместе с городом", () => {
    const cands = buildCandidates(LEGS);
    const swapped = cands.find((x) => x.label.includes("поменять местами Стамбул и Порту"))!;
    // порядок: Оскол → Москва → Порту → Стамбул → Оскол
    // гэпы: Москва 1 день, затем Порту получает гэп Порту (2), Стамбул гэп Стамбула (2)
    expect(swapped.legs.map((l) => `${l.from.name}→${l.to.name}`)).toEqual([
      "Оскол→Москва",
      "Москва→Порту",
      "Порту→Стамбул",
      "Стамбул→Оскол",
    ]);
    expect(swapped.legs.map((l) => l.date)).toEqual(["2026-09-10", "2026-09-11", "2026-09-13", "2026-09-15"]);
  });

  it("кандидаты со сдвигом старта двигают все даты", () => {
    const cands = buildCandidates(LEGS);
    const shifted = cands.find((x) => x.label.includes("+1"))!;
    expect(shifted.legs[0].date).toBe("2026-09-11");
    expect(shifted.legs[3].date).toBe("2026-09-16");
  });

  it("не создаёт вырожденных плеч город→тот же город", () => {
    // Оскол → Москва → Оскол → Порту → Оскол: свап Москва↔Оскол дал бы Оскол→Оскол
    const legs = [
      leg("Оскол", "Москва", "2026-09-10"),
      leg("Москва", "Оскол2", "2026-09-11"),
      leg("Оскол2", "Порту", "2026-09-12"),
      leg("Порту", "Оскол", "2026-09-14"),
    ];
    for (const cand of buildCandidates(legs)) {
      for (const l of cand.legs) expect(l.from.name).not.toBe(l.to.name);
    }
  });
});

describe("optimize", () => {
  // Матрица: Стамбул↔Порту дорого в текущем порядке, дёшево после свапа
  const matrix: Record<string, PriceQuote> = {
    "Оскол>Москва": { found: true, price: 3000, minutes: 600 },
    "Москва>Стамбул": { found: true, price: 17000, minutes: 240 },
    "Стамбул>Порту": { found: true, price: 24000, minutes: 400 },
    "Порту>Оскол": { found: true, price: 25000, minutes: 700 },
    // после свапа
    "Москва>Порту": { found: true, price: 15000, minutes: 300 },
    "Порту>Стамбул": { found: true, price: 800, minutes: 250 },
    "Стамбул>Оскол": { found: true, price: 16000, minutes: 500 },
  };
  const priceOf = async (l: PlanLeg): Promise<PriceQuote> =>
    matrix[`${l.from.name}>${l.to.name}`] ?? { found: false, price: 0, minutes: 0 };

  it("находит выгодную перестановку и считает дельту", async () => {
    const r = await optimize(LEGS, priceOf, { timeWeightRubPerMin: 0 });
    expect(r.current?.price).toBe(69000);
    expect(r.suggestions.length).toBeGreaterThan(0);
    const best = r.suggestions[0];
    expect(best.label).toContain("поменять местами Стамбул и Порту");
    expect(best.price).toBe(34800);
    expect(best.deltaPrice).toBe(-34200);
  });

  it("кандидаты без цен отбрасываются, а не роняют оптимизацию", async () => {
    const r = await optimize(LEGS, priceOf, { timeWeightRubPerMin: 0 });
    // сдвиги старта используют те же пары — они valid; ни один null не попал
    expect(r.combinations).toBeGreaterThan(r.suggestions.length);
  });

  it("«план уже оптимален»: без более дешёвых кандидатов suggestions пуст", async () => {
    const flat = async (): Promise<PriceQuote> => ({ found: true, price: 1000, minutes: 100 });
    const r = await optimize(LEGS, flat);
    expect(r.suggestions).toHaveLength(0);
  });
});

describe("addDays", () => {
  it("переходит через границу месяца", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDays("2026-09-01", -2)).toBe("2026-08-30");
  });
});
