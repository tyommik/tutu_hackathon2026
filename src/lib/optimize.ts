/**
 * Оптимизатор маршрута (дизайн-док): перебор ДЕТЕРМИНИРОВАННЫЙ, не LLM.
 * Кандидаты: перестановки промежуточных городов (2-opt свапы) и сдвиги
 * старта ±1-2 дня. Цены — из кэша поисков через инжектируемый PriceSource.
 * Скоринг = цена + время в пути × вес. LLM (если появится) — только
 * объяснение готовых результатов.
 */

import { cityId, type CityRef, type Leg, type Mode } from "./trip";

export interface PlanLeg {
  from: CityRef;
  to: CityRef;
  date: string;
  mode: Mode;
}

export interface PriceQuote {
  found: boolean;
  price: number;
  minutes: number;
}

export type PriceSource = (leg: PlanLeg) => Promise<PriceQuote>;

export interface ScoredPlan {
  label: string;
  legs: PlanLeg[];
  price: number;
  minutes: number;
  score: number;
}

export interface OptimizeResult {
  current: ScoredPlan | null;
  /** Лучшие альтернативы строго дешевле по скору, отсортированы. */
  suggestions: Array<ScoredPlan & { deltaPrice: number; deltaMinutes: number }>;
  combinations: number;
  evaluated: number;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface Stop {
  city: CityRef;
  /** дней от отправления предыдущего плеча до отправления из этого города */
  gapDays: number;
}

/** Разбирает legs на цепочку остановок с сохранением ритма дат. */
export function toChain(legs: Leg[]): { start: CityRef; startDate: string; stops: Stop[]; end: CityRef } {
  if (legs.length === 0) throw new Error("пустой маршрут");
  const stops: Stop[] = [];
  for (let i = 1; i < legs.length; i++) {
    stops.push({
      city: legs[i].from,
      gapDays: Math.max(
        0,
        Math.round((Date.parse(legs[i].date) - Date.parse(legs[i - 1].date)) / 86_400_000),
      ),
    });
  }
  return { start: legs[0].from, startDate: legs[0].date, stops, end: legs[legs.length - 1].to };
}

/** Собирает план из цепочки; режим пары берётся из карты оригинала. */
export function fromChain(
  start: CityRef,
  startDate: string,
  stops: Stop[],
  end: CityRef,
  modeByPair: Map<string, Mode>,
): PlanLeg[] {
  const seq = [start, ...stops.map((s) => s.city), end];
  const legs: PlanLeg[] = [];
  let date = startDate;
  for (let i = 0; i < seq.length - 1; i++) {
    if (i > 0) date = addDays(date, stops[i - 1].gapDays);
    const pair = `${cityId(seq[i])}>${cityId(seq[i + 1])}`;
    legs.push({ from: seq[i], to: seq[i + 1], date, mode: modeByPair.get(pair) ?? "any" });
  }
  return legs;
}

function chainKey(startDate: string, stops: Stop[]): string {
  return startDate + "|" + stops.map((s) => cityId(s.city)).join(">");
}

function hasDegenerateLeg(start: CityRef, stops: Stop[], end: CityRef): boolean {
  const seq = [start, ...stops.map((s) => s.city), end];
  for (let i = 0; i < seq.length - 1; i++) {
    if (cityId(seq[i]) === cityId(seq[i + 1])) return true;
  }
  return false;
}

export interface Candidate {
  label: string;
  legs: PlanLeg[];
}

/** Кандидаты: текущий порядок, 2-opt свапы промежуточных, сдвиги старта. */
export function buildCandidates(legs: Leg[]): Candidate[] {
  const { start, startDate, stops, end } = toChain(legs);
  const modeByPair = new Map<string, Mode>();
  for (const l of legs) modeByPair.set(`${cityId(l.from)}>${cityId(l.to)}`, l.mode);

  const seen = new Set<string>([chainKey(startDate, stops)]);
  const out: Candidate[] = [
    { label: "текущий порядок", legs: fromChain(start, startDate, stops, end, modeByPair) },
  ];

  for (let i = 0; i < stops.length; i++) {
    for (let j = i + 1; j < stops.length; j++) {
      const swapped = stops.slice();
      [swapped[i], swapped[j]] = [swapped[j], swapped[i]];
      const key = chainKey(startDate, swapped);
      if (seen.has(key) || hasDegenerateLeg(start, swapped, end)) continue;
      seen.add(key);
      out.push({
        label: `поменять местами ${stops[i].city.name} и ${stops[j].city.name}`,
        legs: fromChain(start, startDate, swapped, end, modeByPair),
      });
    }
  }

  for (const shift of [-2, -1, 1, 2]) {
    const d = addDays(startDate, shift);
    const key = chainKey(d, stops);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      label: shift > 0 ? `сдвинуть старт на +${shift} дн.` : `сдвинуть старт на ${shift} дн.`,
      legs: fromChain(start, d, stops, end, modeByPair),
    });
  }

  return out;
}

export interface OptimizeOptions {
  /** ₽ за минуту пути в скоринге; 0 — чисто по цене. */
  timeWeightRubPerMin?: number;
  maxSuggestions?: number;
}

export async function optimize(
  legs: Leg[],
  priceOf: PriceSource,
  { timeWeightRubPerMin = 5, maxSuggestions = 3 }: OptimizeOptions = {},
): Promise<OptimizeResult> {
  const candidates = buildCandidates(legs);
  let evaluated = 0;

  const scored: Array<ScoredPlan | null> = [];
  for (const c of candidates) {
    const quotes = await Promise.all(c.legs.map((l) => priceOf(l)));
    evaluated += quotes.length;
    if (quotes.some((q) => !q.found)) {
      scored.push(null);
      continue;
    }
    const price = quotes.reduce((a, q) => a + q.price, 0);
    const minutes = quotes.reduce((a, q) => a + q.minutes, 0);
    scored.push({
      label: c.label,
      legs: c.legs,
      price: Math.round(price * 100) / 100,
      minutes,
      score: price + minutes * timeWeightRubPerMin,
    });
  }

  const current = scored[0];
  const suggestions = scored
    .slice(1)
    .filter((s): s is ScoredPlan => s !== null)
    .filter((s) => current === null || s.score < current.score - 1)
    .sort((a, b) => a.score - b.score)
    .slice(0, maxSuggestions)
    .map((s) => ({
      ...s,
      deltaPrice: current ? Math.round((s.price - current.price) * 100) / 100 : 0,
      deltaMinutes: current ? s.minutes - current.minutes : 0,
    }));

  return { current, suggestions, combinations: candidates.length, evaluated };
}
