import { NextResponse } from "next/server";
import { optimize, type PlanLeg, type PriceQuote } from "@/lib/optimize";
import { searchLeg } from "@/lib/search";
import type { Leg, Party } from "@/lib/trip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Простой пул: не больше N живых запросов к MCP одновременно. */
function limiter(n: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= n) await new Promise<void>((res) => queue.push(res));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

export async function POST(req: Request) {
  let body: { legs?: Leg[]; timeWeightRubPerMin?: number; party?: Party };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON с legs" }, { status: 400 });
  }
  const legs = body.legs;
  if (!Array.isArray(legs) || legs.length < 2) {
    return NextResponse.json(
      { error: "Оптимизировать можно маршрут из двух и более плеч" },
      { status: 400 },
    );
  }
  if (legs.length > 12) {
    return NextResponse.json({ error: "Слишком длинный маршрут (макс. 12 плеч)" }, { status: 400 });
  }

  const run = limiter(10);
  // Дедуп внутри запроса: одинаковые (пара, дата, режим) считаем один раз.
  const memo = new Map<string, Promise<PriceQuote>>();

  const priceOf = (l: PlanLeg): Promise<PriceQuote> => {
    const key = `${l.from.name}>${l.to.name}@${l.date}#${l.mode}`;
    const hit = memo.get(key);
    if (hit) return hit;
    const p = run(async (): Promise<PriceQuote> => {
      try {
        // pageSize совпадает с hydrate на клиенте — оптимизатор попадает
        // в уже прогретый кэш вместо создания параллельного набора ключей
        const r = await searchLeg({
          origin: l.from.name,
          destination: l.to.name,
          date: l.date,
          mode: l.mode === "any" ? undefined : l.mode,
          pageSize: 10,
          party: body.party,
        });
        const o = r.offers[0];
        if (!o) return { found: false, price: 0, minutes: 0 };
        return { found: true, price: o.price, minutes: o.durationMin ?? 0 };
      } catch {
        return { found: false, price: 0, minutes: 0 };
      }
    });
    memo.set(key, p);
    return p;
  };

  const started = Date.now();
  const result = await optimize(legs, priceOf, {
    timeWeightRubPerMin: body.timeWeightRubPerMin ?? 5,
  });
  return NextResponse.json({ ...result, tookMs: Date.now() - started, uniqueSearches: memo.size });
}
