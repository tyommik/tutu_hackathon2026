/**
 * Выгрузка курсов ЦБ в снимок рядом с кодом.
 *
 * Сервер в Казахстане до cbr.ru не достучится: TCP открывается, запрос
 * виснет. Поэтому курсы забираются с рабочей машины и уезжают на сервер
 * вместе с кодом — deploy/push.sh обновляет снимок перед каждой выкладкой.
 *
 *   node scripts/fetch-rates.mjs
 *
 * Кладём СЫРОЙ XML, а не разобранные курсы: разбирает его тот же
 * parseCbrXml, что и живой ответ. Второй парсер здесь означал бы, что
 * снимок и живые курсы однажды разойдутся — а там номиналы, на которых
 * ошибка стоит ста крат (иена и форинт котируются за 100 единиц).
 */

import { writeFile } from "node:fs/promises";

const URL_CBR = "https://www.cbr.ru/scripts/XML_daily.asp";
const OUT = new URL("../src/lib/ratesSnapshot.json", import.meta.url);

const res = await fetch(URL_CBR, { signal: AbortSignal.timeout(20_000) });
if (!res.ok) {
  console.error(`ЦБ ответил HTTP ${res.status}`);
  process.exit(1);
}

// ЦБ отдаёт windows-1251; в снимке храним уже перекодированным в UTF-8,
// чтобы JSON оставался обычным текстом без возни с байтами
const xml = new TextDecoder("windows-1251").decode(await res.arrayBuffer());

const date = /Date="([^"]+)"/.exec(xml)?.[1];
const count = (xml.match(/<Valute/g) ?? []).length;
if (!date || count < 5) {
  console.error(`Похоже на мусор вместо курсов: дата ${date}, валют ${count}`);
  process.exit(1);
}

await writeFile(OUT, JSON.stringify({ date, xml }, null, 0) + "\n", "utf8");
console.log(`Снимок курсов ЦБ на ${date}: ${count} валют → src/lib/ratesSnapshot.json`);
