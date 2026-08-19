import type { Mode } from "./trip";

/** Проекция как в make_land.py: линейная равнопромежуточная под 1000x620. */
export const VB = { W: 1000, H: 620 };

export function project(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng + 12) / 54) * VB.W,
    y: ((58 - lat) / 23) * VB.H,
  };
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
