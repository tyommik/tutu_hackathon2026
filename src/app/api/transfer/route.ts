import { NextResponse } from "next/server";
import { suggestHubs } from "@/lib/hubSuggest";
import { McpError } from "@/lib/mcp";
import { searchLeg } from "@/lib/search";
import { bestVia, hubCandidates, rankTransfers, type TransferOption } from "@/lib/transfers";
import { DEFAULT_PARTY, type Party } from "@/lib/trip";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Не больше N живых запросов к MCP одновременно. */
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

/** Второе плечо ищем и назавтра: вечерний прилёт в хаб — обычное дело. */
function nextDay(date: string): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * Подбор пересадки для плеча без прямых вариантов: перебираем хабы и
 * возвращаем собранные из двух плеч маршруты с реальными ценами Туту.
 */
export async function POST(req: Request) {
  let body: { origin?: string; destination?: string; date?: string; party?: Party };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }
  const { origin, destination, date } = body;
  if (!origin || !destination || !date) {
    return NextResponse.json({ error: "Нужны origin, destination и date" }, { status: 400 });
  }
  const party = body.party ?? DEFAULT_PARTY;
  // LLM подбирает хабы под маршрут; не ответил — статический список
  const suggested = await suggestHubs(origin, destination);
  const hubs = hubCandidates(origin, destination, 5, suggested ?? undefined);
  const run = limiter(6);
  const started = Date.now();

  const leg = (from: string, to: string, on: string) =>
    run(async () => {
      try {
        const r = await searchLeg({ origin: from, destination: to, date: on, pageSize: 5, party });
        return r.offers;
      } catch {
        // один хаб не ответил — остальные всё равно проверяем
        return [];
      }
    });

  try {
    const results = await Promise.all(
      hubs.map(async (hub): Promise<TransferOption | null> => {
        const [firsts, sameDay] = await Promise.all([
          leg(origin, hub, date),
          leg(hub, destination, date),
        ]);
        if (firsts.length === 0) return null;
        const best = bestVia(hub, firsts, sameDay);
        if (best) return best;
        // в тот же день не стыкуется — пробуем вылет из хаба назавтра
        const tomorrow = await leg(hub, destination, nextDay(date));
        return bestVia(hub, firsts, tomorrow);
      }),
    );

    const options = rankTransfers(results.filter((o): o is TransferOption => o !== null));
    return NextResponse.json({
      options,
      hubsTried: hubs,
      tookMs: Date.now() - started,
    });
  } catch (e) {
    if (e instanceof McpError) {
      return NextResponse.json({ error: `Туту не ответил: ${e.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
