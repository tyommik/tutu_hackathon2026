import type { Mode } from "./trip";

/** Проекция как в make_land.py: линейная равнопромежуточная под 1000x620. */
export const VB = { W: 1000, H: 620 };

export function project(lat: number, lng: number): { x: number; y: number } {
  return {
    x: ((lng + 12) / 54) * VB.W,
    y: ((58 - lat) / 23) * VB.H,
  };
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
