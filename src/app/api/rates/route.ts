import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { parseCbrXml, type Rates } from "@/lib/rates";

export const dynamic = "force-dynamic";

const CBR_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
/** ЦБ обновляет курсы раз в сутки — чаще ходить незачем. */
const TTL_MS = 6 * 60 * 60 * 1000;

/** Курсы ЦБ РФ для пересчёта своих трат в рубли. */
export async function GET() {
  try {
    const { value } = await cached<Rates>(
      "cbr:daily",
      async () => {
        const res = await fetch(CBR_URL, { signal: AbortSignal.timeout(15_000) });
        if (!res.ok) throw new Error(`ЦБ ответил HTTP ${res.status}`);
        // ЦБ отдаёт windows-1251, не UTF-8 — иначе кириллица в названиях рассыпется
        const xml = new TextDecoder("windows-1251").decode(await res.arrayBuffer());
        const parsed = parseCbrXml(xml);
        if (Object.keys(parsed.rates).length < 5) throw new Error("ЦБ вернул пустой список курсов");
        return parsed;
      },
      TTL_MS,
    );
    return NextResponse.json(value);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
