import { NextResponse } from "next/server";
import { cached } from "@/lib/cache";
import { parseCbrXml, snapshotRates, type Rates } from "@/lib/rates";

export const dynamic = "force-dynamic";

const CBR_URL = "https://www.cbr.ru/scripts/XML_daily.asp";
/** ЦБ обновляет курсы раз в сутки — чаще ходить незачем. */
const TTL_MS = 6 * 60 * 60 * 1000;
/**
 * Живой ЦБ отвечает за десятые доли секунды, если отвечает вообще. Там, где
 * он недоступен (сервер в Казахстане: TCP открывается, запрос виснет),
 * ждать долго нечего — быстрее уйти на снимок, чем держать страницу.
 */
const LIVE_TIMEOUT_MS = 4_000;

async function live(): Promise<Rates> {
  const res = await fetch(CBR_URL, { signal: AbortSignal.timeout(LIVE_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`ЦБ ответил HTTP ${res.status}`);
  // ЦБ отдаёт windows-1251, не UTF-8 — иначе кириллица в названиях рассыпется
  const xml = new TextDecoder("windows-1251").decode(await res.arrayBuffer());
  const parsed = parseCbrXml(xml);
  if (Object.keys(parsed.rates).length < 5) throw new Error("ЦБ вернул пустой список курсов");
  return parsed;
}

/** Курсы ЦБ РФ для пересчёта своих трат в рубли. */
export async function GET() {
  try {
    const { value } = await cached<Rates>(
      "cbr:daily",
      async () => {
        try {
          return await live();
        } catch {
          // Снимок лежит рядом с кодом и обновляется при выкладке
          // (scripts/fetch-rates.mjs). Курс суточный, так что вчерашний
          // заметно лучше, чем никакой: без курсов трата остаётся в своей
          // валюте и выпадает из бюджета.
          return snapshotRates();
        }
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
