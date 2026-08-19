/**
 * Перепроецирование запечённого контура суши из линейной проекции в
 * веб-Меркатор (мир 1000×1000, как в src/lib/geo.ts).
 *
 * Исходного make_land.py в репозитории нет, но прежняя проекция линейна и
 * обратима: X=(lon+12)/54*1000, Y=(58-lat)/23*620 — поэтому контур
 * восстанавливается из самого land.ts без данных Natural Earth.
 *
 * Запуск: node scripts/reproject_land.mjs  (переписывает src/lib/land.ts)
 */

import { readFileSync, writeFileSync } from "node:fs";

const FILE = new URL("../src/lib/land.ts", import.meta.url);
const WORLD = 1000;

const src = readFileSync(FILE, "utf8");
const m = src.match(/LAND_D = "([^"]+)"/);
if (!m) throw new Error("не нашёл LAND_D в src/lib/land.ts");

const mercY = (lat) => {
  const r = (Math.max(-85.05112878, Math.min(85.05112878, lat)) * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * WORLD;
};

const fmt = (n) => {
  const s = n.toFixed(2);
  return s.replace(/\.?0+$/, "") || "0";
};

const tokens = m[1].match(/[MZ]|-?\d+(?:\.\d+)?/g);
const out = [];
let pending = null;
for (const t of tokens) {
  if (t === "M" || t === "Z") {
    out.push(t);
    continue;
  }
  const v = Number(t);
  if (pending === null) {
    pending = v;
    continue;
  }
  // пара (x, y) старой проекции → (lon, lat) → Меркатор
  const lon = (pending / 1000) * 54 - 12;
  const lat = 58 - (v / 620) * 23;
  out.push(`${fmt(((lon + 180) / 360) * WORLD)} ${fmt(mercY(lat))}`);
  pending = null;
}
if (pending !== null) throw new Error("нечётное число координат в пути");

// M и Z клеим к числам без лишних пробелов — как в исходнике
const d = out
  .join(" ")
  .replace(/M /g, "M")
  .replace(/ Z/g, "Z");

const header =
  "// Сгенерировано scripts/reproject_land.mjs из прежнего land.ts " +
  "(Natural Earth 110m; проекция: веб-Меркатор, мир 1000×1000 — см. src/lib/geo.ts)";
writeFileSync(FILE, `${header}\nexport const LAND_D = "${d}";\n`);
console.log(`ok: ${tokens.length} токенов, ${d.length} байт пути`);
