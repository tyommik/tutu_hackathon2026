import { NextResponse } from "next/server";
import { McpError } from "@/lib/mcp";
import { searchLeg, searchStay } from "@/lib/search";
import type { Mode, Party } from "@/lib/trip";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }

  const kind = body.kind;
  try {
    if (kind === "leg") {
      const { origin, destination, date, mode, pageSize, party, directOnly, carriers } = body as {
        origin?: string; destination?: string; date?: string; mode?: Mode; pageSize?: number;
        party?: Party; directOnly?: boolean; carriers?: string[];
      };
      if (!origin || !destination || !date) {
        return NextResponse.json({ error: "Нужны origin, destination и date" }, { status: 400 });
      }
      const r = await searchLeg({ origin, destination, date, mode, pageSize, party, directOnly, carriers });
      return NextResponse.json({
        offers: r.offers,
        meta: r.meta,
        unavailable: r.unavailable,
        cacheHit: r.cacheHit,
      });
    }

    if (kind === "stay") {
      const { city, checkin, checkout, pageSize, party, filters } = body as {
        city?: string; checkin?: string; checkout?: string; pageSize?: number; party?: Party;
        filters?: Record<string, unknown>;
      };
      if (!city || !checkin || !checkout) {
        return NextResponse.json({ error: "Нужны city, checkin и checkout" }, { status: 400 });
      }
      const r = await searchStay(city, checkin, checkout, pageSize, party, filters);
      return NextResponse.json({ hotels: r.hotels, meta: r.meta, cacheHit: r.cacheHit });
    }

    return NextResponse.json({ error: "kind должен быть 'leg' или 'stay'" }, { status: 400 });
  } catch (e) {
    if (e instanceof McpError) {
      return NextResponse.json({ error: `Туту не ответил: ${e.message}`, tool: e.tool }, { status: 502 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
