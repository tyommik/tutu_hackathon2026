/**
 * Курсы валют ЦБ РФ.
 *
 * Свои траты в поездке человек считает в валюте места («такси 40 €»), а
 * бюджет плана — в рублях, рядом с ценами Туту. Источник курса — ЦБ:
 * он официальный, бесплатный и не требует ключа. Курс фиксируется в момент
 * добавления вместе с датой, чтобы позже было видно, по чему считали.
 */

import snapshot from "./ratesSnapshot.json";

export interface Rates {
  /** Сколько рублей за одну единицу валюты. RUB всегда 1. */
  rates: Record<string, number>;
  /** Дата курса ЦБ, YYYY-MM-DD. */
  date: string;
  source: string;
}

/** Валюты, которые чаще всего нужны в наших направлениях, — вперёд списка. */
export const POPULAR_CURRENCIES = ["RUB", "EUR", "USD", "TRY", "AED", "GEL", "RSD", "THB", "CNY", "KZT"];

export const CURRENCY_SIGN: Record<string, string> = {
  RUB: "₽",
  EUR: "€",
  USD: "$",
  GBP: "£",
  TRY: "₺",
  CNY: "¥",
  JPY: "¥",
};

/** «17.08.2026» → «2026-08-17». */
function cbrDate(d: string): string {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(d.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
}

/**
 * Разбор XML_daily.asp. Свой парсер вместо библиотеки: формат ЦБ плоский и
 * стабильный, а тянуть XML-парсер ради пяти полей незачем. Номинал важен —
 * иены и форинты котируются за 100 единиц.
 */
export function parseCbrXml(xml: string): Rates {
  const date = cbrDate(/Date="([^"]+)"/.exec(xml)?.[1] ?? "");
  const rates: Record<string, number> = { RUB: 1 };
  const re = /<Valute[^>]*>([\s\S]*?)<\/Valute>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const block = m[1];
    const code = /<CharCode>([A-Z]{3})<\/CharCode>/.exec(block)?.[1];
    const nominal = Number(/<Nominal>(\d+)<\/Nominal>/.exec(block)?.[1] ?? "1");
    const value = Number(
      (/<Value>([\d.,\s]+)<\/Value>/.exec(block)?.[1] ?? "").replace(/\s/g, "").replace(",", "."),
    );
    if (!code || !Number.isFinite(value) || value <= 0 || nominal <= 0) continue;
    rates[code] = value / nominal;
  }
  return { rates, date, source: "ЦБ РФ" };
}

/**
 * Курсы из снимка, снятого при выкладке (scripts/fetch-rates.mjs).
 *
 * Разбирает снимок тот же parseCbrXml, что и живой ответ ЦБ: снимок хранит
 * сырой XML именно ради этого. Второй парсер означал бы, что снимок и живые
 * курсы однажды разойдутся — а там номиналы, на которых ошибка стоит ста
 * крат (иена и форинт котируются за 100 единиц).
 */
export function snapshotRates(): Rates {
  const r = parseCbrXml(snapshot.xml);
  return { ...r, source: `ЦБ РФ, снимок от ${snapshot.date}` };
}

export interface Converted {
  rub: number;
  rate: number;
  rateDate: string;
}

/**
 * Перевод суммы в рубли. Возвращает null, если курса нет — тогда трата
 * останется в своей валюте, а бюджет честно скажет, что не всё посчитано.
 */
export function toRub(amount: number, currency: string, r: Rates | null): Converted | null {
  if (!Number.isFinite(amount)) return null;
  const code = currency.toUpperCase();
  if (code === "RUB") return { rub: amount, rate: 1, rateDate: r?.date ?? "" };
  const rate = r?.rates[code];
  if (!rate) return null;
  return { rub: Math.round(amount * rate * 100) / 100, rate, rateDate: r.date };
}

/** Коды валют для селекта: сначала популярные, дальше по алфавиту. */
export function currencyOptions(r: Rates | null): string[] {
  const all = new Set([...POPULAR_CURRENCIES, ...Object.keys(r?.rates ?? {})]);
  const rest = [...all].filter((c) => !POPULAR_CURRENCIES.includes(c)).sort();
  return [...POPULAR_CURRENCIES.filter((c) => all.has(c)), ...rest];
}
