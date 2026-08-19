import type { Mode } from "./trip";
import { normX, normY } from "./tiles";

/**
 * Опорный размер вида: по нему нормируются экранные величины (s = view.w /
 * VB.W в MapCanvas) и держится соотношение сторон окна карты.
 */
export const VB = { W: 1000, H: 620 };

/**
 * Мир в веб-Меркаторе: квадрат WORLD×WORLD SVG-единиц. Проекция общая с
 * картой отелей (lib/tiles) — под неё ложатся XYZ-тайлы MapTiler, и одна
 * геометрия обслуживает и схему, и тайловую подложку.
 */
export const WORLD = 1000;

export function project(lat: number, lng: number): { x: number; y: number } {
  return { x: normX(lng) * WORLD, y: normY(lat) * WORLD };
}

/**
 * Домашний вид — тот же регион, что показывала прежняя линейная карта:
 * Европа и запад России (долготы −12..42, широты от 58° вниз).
 */
export const HOME = {
  x: normX(-12) * WORLD,
  y: normY(58) * WORLD,
  w: (54 / 360) * WORLD,
  h: (54 / 360) * WORLD * (VB.H / VB.W),
};

/**
 * Вид, вписывающий набор точек: центр по bbox, ширина — от разброса (с
 * учётом соотношения сторон окна), плюс отступ долей и минимум ширины,
 * чтобы одиночный пин не давал зум «в стену дома».
 */
export function fitRect(
  points: Array<{ x: number; y: number }>,
  aspect: number,
  padFrac: number = 0.25,
  minW: number = 0.2,
): { x: number; y: number; w: number; h: number } | null {
  if (points.length === 0) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const w = Math.max(maxX - minX, (maxY - minY) / aspect, minW) * (1 + padFrac);
  const h = w * aspect;
  return { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
}

export interface SvgTile {
  key: string;
  /** Индекс тайла: x обёрнут по цикличной долготе. */
  x: number;
  y: number;
  z: number;
  /** Левый верхний угол в SVG-единицах мира (для обёрнутых — без обёртки). */
  sx: number;
  sy: number;
  size: number;
}

/**
 * XYZ-тайлы, накрывающие видимую область главной карты.
 *
 * Зум подбирается так, чтобы тайл 256px рендерился примерно в свой размер
 * на экране; глубже maxZ тайл-сервер не отдаёт. Долгота циклична — индекс
 * оборачивается, позиция sx остаётся «как есть», чтобы тайл лёг в кадр.
 */
export function svgTiles(
  view: { x: number; y: number; w: number; h: number },
  screenW: number,
  maxZ: number = 18,
): SvgTile[] {
  const worldPx = screenW * (WORLD / view.w);
  const z = Math.max(0, Math.min(maxZ, Math.round(Math.log2(worldPx / 256))));
  const n = 2 ** z;
  const size = WORLD / n;
  const x0 = Math.floor(view.x / size);
  const x1 = Math.ceil((view.x + view.w) / size) - 1;
  const y0 = Math.max(0, Math.floor(view.y / size));
  const y1 = Math.min(n - 1, Math.ceil((view.y + view.h) / size) - 1);
  const out: SvgTile[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const wrapped = ((x % n) + n) % n;
      out.push({ key: `${z}/${wrapped}/${y}@${x}`, x: wrapped, y, z, sx: x * size, sy: y * size, size });
    }
  }
  return out;
}

/**
 * Точка подписи цены плеча — рядом с линией, а не на ней.
 *
 * Прежний вариант «чуть выше середины хорды» ложился на само плечо: у
 * наземных — на наклонных линиях, у авиа — всякий раз, когда дуга выгибается
 * вверх (подпись оказывалась с внутренней стороны дуги). Здесь подпись
 * уходит по нормали: у наземных — всегда на верхнюю сторону, у авиа — наружу
 * дуги за её вершиной (сторона выгиба та же, что у control-точки legPathD).
 *
 * @param s экранный масштаб карты: зазоры растут с ним, геометрия дуги — нет
 */
export function priceLabelPos(
  a: { x: number; y: number },
  b: { x: number; y: number },
  mode: Mode,
  s: number = 1,
): { x: number; y: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  // чем горизонтальнее нормаль, тем больше зазор: текст центрирован, и у
  // вертикальной линии его половина ширины иначе легла бы на линию
  const clear = ((mode === "avia" ? 12 : 10) + Math.abs(nx) * 22) * s;

  if (mode === "avia") {
    const lift = Math.min(len * 0.22, 90);
    // подпись ниже линии — базовая линия текста требует запаса на высоту глифов
    const baseline = ny > 0 ? 8 * s : 0;
    return { x: mx + nx * (lift / 2 + clear), y: my + ny * (lift / 2 + clear) + baseline };
  }

  // у прямой стороны равнозначны — берём верхнюю, там подпись не ждёт запаса
  if (ny > 0) {
    nx = -nx;
    ny = -ny;
  }
  return { x: mx + nx * clear, y: my + ny * clear };
}

/** Дуга для авиа, прямая для наземного транспорта. */
export function legPathD(
  a: { x: number; y: number },
  b: { x: number; y: number },
  mode: Mode,
): string {
  if (mode === "avia") {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const lift = Math.min(len * 0.22, 90);
    return `M${a.x} ${a.y} Q${mx - (dy / len) * lift} ${my + (dx / len) * lift} ${b.x} ${b.y}`;
  }
  return `M${a.x} ${a.y} L${b.x} ${b.y}`;
}
