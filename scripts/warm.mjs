/**
 * Прогрев кэша демо-легендой.
 *
 * Первый показ на свежем сервере — самый медленный: подбор одного плеча
 * идёт к Туту живьём, а оптимизатор перебирает десятки комбинаций. Скрипт
 * прогоняет ровно те же запросы, что делает интерфейс, поэтому к началу
 * демо кэш уже горячий и всё открывается мгновенно.
 *
 *   node scripts/warm.mjs [http://localhost:3000]
 *
 * Легенда читается из src/lib/legend.json — того же файла, что и кнопка
 * «Загрузить демо-легенду», так что разъехаться они не могут.
 */

import { readFile } from "node:fs/promises";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const PARTY = { adults: 1, childrenAges: [] };

const legend = JSON.parse(await readFile(new URL("../src/lib/legend.json", import.meta.url), "utf8"));

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

/** Дата в локальной зоне оффера — как localDate в lib/trip. */
const dayOf = (iso) => iso.slice(0, 10);

const stops = legend.stops;
const legs = stops.slice(1).map((s, i) => ({
  from: stops[i].name,
  to: s.name,
  date: s.date,
  mode: s.mode,
}));

console.log(`Прогрев ${BASE}: ${legs.length} плеч легенды`);
const started = Date.now();
const picked = [];

for (const leg of legs) {
  const t = Date.now();
  // pageSize 10 — тот же пул, что берёт hydrate в интерфейсе; другое
  // значение дало бы другой ключ кэша, и прогрев был бы впустую
  const { offers = [] } = await post("/api/search", {
    kind: "leg",
    origin: leg.from,
    destination: leg.to,
    date: leg.date,
    mode: leg.mode,
    pageSize: 10,
    party: PARTY,
  });
  picked.push(offers[0]);
  const ms = Date.now() - t;
  console.log(
    `  ${leg.from} → ${leg.to} ${leg.date}: ${offers.length} вариантов, ${(ms / 1000).toFixed(1)} с` +
      (offers[0] ? ` (от ${Math.round(offers[0].price)} ₽)` : " — пусто"),
  );
}

// Ночёвки считаем из найденных офферов — так же, как deriveStays, иначе
// ключи отелей не совпадут с теми, что запросит интерфейс.
const stays = [];
for (let i = 0; i < picked.length - 1; i++) {
  const a = picked[i];
  const b = picked[i + 1];
  if (!a || !b) continue;
  const checkin = dayOf(a.arrivalAt);
  const checkout = dayOf(b.departureAt);
  if (checkin >= checkout) continue;
  stays.push({ city: legs[i].to, checkin, checkout });
}

for (const stay of stays) {
  const t = Date.now();
  const { hotels = [] } = await post("/api/search", {
    kind: "stay",
    city: stay.city,
    checkin: stay.checkin,
    checkout: stay.checkout,
    pageSize: 6,
    party: PARTY,
  });
  console.log(
    `  отели ${stay.city} ${stay.checkin}..${stay.checkout}: ${hotels.length}, ${((Date.now() - t) / 1000).toFixed(1)} с`,
  );
}

console.log(`Готово за ${((Date.now() - started) / 1000).toFixed(1)} с`);
