import { NextResponse } from "next/server";
import coords from "@/lib/cityCoords.json";

export const dynamic = "force-dynamic";

/**
 * Координаты городов по названию (Natural Earth 10m populated places,
 * 15k названий с русскими и латинскими вариантами). Живёт на сервере:
 * справочник ~450 КБ, в клиентский бандл его тащить незачем.
 */
const TABLE = coords as unknown as Record<string, [number, number]>;

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/ё/g, "е").replace(/['`]/g, "");
}

export function lookup(name: string): { lat: number; lng: number } | undefined {
  const direct = TABLE[norm(name)];
  if (direct) return { lat: direct[0], lng: direct[1] };
  // «Москва — Внуково (VKO), терм. A» → «Москва»; «Сочи (Адлер)» → «Сочи»
  const trimmed = norm(name).split(/[—(,]/)[0].trim();
  const alt = TABLE[trimmed];
  return alt ? { lat: alt[0], lng: alt[1] } : undefined;
}

export async function POST(req: Request) {
  let body: { names?: string[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON с names" }, { status: 400 });
  }
  const names = Array.isArray(body.names) ? body.names.slice(0, 100) : [];
  const out: Record<string, { lat: number; lng: number }> = {};
  for (const n of names) {
    if (typeof n !== "string") continue;
    const c = lookup(n);
    if (c) out[n] = c;
  }
  return NextResponse.json({ coords: out });
}
