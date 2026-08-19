import { describe, expect, it } from "vitest";
import {
  cityView,
  coreOf,
  countInView,
  fitView,
  metersPerPixel,
  normX,
  normY,
  panBy,
  scaleStep,
  TILE_SIZE,
  tileUrl,
  visibleTiles,
  worldPx,
  zoomBy,
} from "./tiles";

const ISTANBUL = { lat: 41.01, lng: 28.97 };
const AIRPORT = { lat: 41.2073, lng: 28.7305 };

describe("проекция", () => {
  it("нулевой меридиан и экватор — центр мира", () => {
    expect(normX(0)).toBeCloseTo(0.5, 10);
    expect(normY(0)).toBeCloseTo(0.5, 10);
  });

  it("края мира", () => {
    expect(normX(-180)).toBeCloseTo(0, 10);
    expect(normX(180)).toBeCloseTo(1, 10);
    expect(normY(85.05112878)).toBeCloseTo(0, 6);
  });

  it("широту за полюсом зажимает, а не уводит в бесконечность", () => {
    expect(Number.isFinite(normY(90))).toBe(true);
    expect(normY(90)).toBeCloseTo(normY(85.05112878), 10);
  });

  it("на зуме 0 весь мир — один тайл", () => {
    const p = worldPx({ lat: 0, lng: 0 }, 0);
    expect(p.x).toBeCloseTo(TILE_SIZE / 2, 6);
    expect(p.y).toBeCloseTo(TILE_SIZE / 2, 6);
  });

  it("метры на пиксель: на экваторе зум 0 — известная константа", () => {
    expect(metersPerPixel(0, 0)).toBeCloseTo(156543.03, 1);
    // каждый зум вдвое подробнее
    expect(metersPerPixel(0, 1)).toBeCloseTo(metersPerPixel(0, 0) / 2, 6);
  });
});

describe("fitView", () => {
  it("вмещает обе точки и центрируется между ними", () => {
    const v = fitView([ISTANBUL, AIRPORT], 600, 700);
    const a = worldPx(ISTANBUL, v.z);
    const b = worldPx(AIRPORT, v.z);
    // обе точки внутри окна
    for (const p of [a, b]) {
      expect(Math.abs(p.x - v.cx)).toBeLessThanOrEqual(300);
      expect(Math.abs(p.y - v.cy)).toBeLessThanOrEqual(350);
    }
    expect(v.cx).toBeCloseTo((a.x + b.x) / 2, 6);
  });

  it("одна точка — улица, а не континент", () => {
    expect(fitView([ISTANBUL], 600, 700).z).toBe(15);
  });

  it("пустой список не роняет карту", () => {
    expect(fitView([], 600, 700).z).toBe(2);
  });
});

describe("cityView", () => {
  it("окно примерно заданной ширины вокруг центра", () => {
    const v = cityView(ISTANBUL, 620, 572, 4000);
    const m = metersPerPixel(ISTANBUL.lat, v.z);
    const acrossShortSide = m * 572;
    // не мельче запрошенного и не грубее вдвое — целимся в 4 км
    expect(acrossShortSide).toBeGreaterThanOrEqual(4000);
    expect(acrossShortSide).toBeLessThan(8000);
    expect(v.cx).toBeCloseTo(worldPx(ISTANBUL, v.z).x, 6);
  });

  it("центр города в кадре, отель у аэропорта — нет", () => {
    const v = cityView(ISTANBUL, 620, 572, 4000);
    expect(countInView([ISTANBUL], v, 620, 572)).toBe(1);
    expect(countInView([AIRPORT], v, 620, 572)).toBe(0);
  });
});

describe("coreOf", () => {
  const cluster = [
    { lat: 41.0028, lng: 28.9744 },
    { lat: 41.0105, lng: 28.9762 },
    { lat: 41.0034, lng: 28.9767 },
    { lat: 41.0099, lng: 28.9782 },
    { lat: 41.0095, lng: 28.9750 },
    { lat: 41.0125, lng: 28.9747 },
  ];

  it("выбрасывает отель у аэропорта, а центр города оставляет", () => {
    const core = coreOf([...cluster, AIRPORT]);
    expect(core).not.toContainEqual(AIRPORT);
    expect(core.length).toBeGreaterThanOrEqual(cluster.length - 1);
  });

  it("равномерный набор не режет: ядро — это большинство", () => {
    expect(coreOf(cluster).length).toBeGreaterThanOrEqual(Math.ceil(cluster.length * 0.6));
  });

  it("на трёх точках и меньше не мудрит", () => {
    const three = cluster.slice(0, 3);
    expect(coreOf(three)).toEqual(three);
  });

  it("ядро даёт более крупный зум, чем полный охват", () => {
    const all = [...cluster, AIRPORT];
    expect(fitView(coreOf(all), 600, 700).z).toBeGreaterThan(fitView(all, 600, 700).z);
  });
});

describe("zoomBy", () => {
  it("точка под курсором остаётся на месте", () => {
    const w = 600;
    const h = 400;
    const view = fitView([ISTANBUL, AIRPORT], w, h);
    const mx = 137;
    const my = 288;
    const before = view.cx - w / 2 + mx;
    const beforeY = view.cy - h / 2 + my;
    const next = zoomBy(view, 1, mx, my, w, h);
    // мировая точка удвоилась вместе с зумом и осталась под тем же пикселем
    expect(next.cx - w / 2 + mx).toBeCloseTo(before * 2, 6);
    expect(next.cy - h / 2 + my).toBeCloseTo(beforeY * 2, 6);
  });

  it("упирается в границы зума", () => {
    const v = { cx: 100, cy: 100, z: 18 };
    expect(zoomBy(v, 1, 0, 0, 600, 400)).toBe(v);
  });
});

describe("visibleTiles", () => {
  it("покрывает окно и не выходит за полюса", () => {
    const view = { cx: 0, cy: 0, z: 2 };
    const tiles = visibleTiles(view, 600, 400);
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.every((t) => t.y >= 0 && t.y < 4)).toBe(true);
  });

  it("мир по долготе цикличен: слева от нулевого тайла — последний", () => {
    const view = { cx: 10, cy: 512, z: 2 };
    const tiles = visibleTiles(view, 600, 200);
    expect(tiles.some((t) => t.x === 3)).toBe(true);
    // ключ различает разные экранные позиции одного и того же тайла
    expect(new Set(tiles.map((t) => t.key)).size).toBe(tiles.length);
  });
});

describe("panBy", () => {
  it("сдвигает центр против курсора", () => {
    const v = { cx: 1000, cy: 1000, z: 10 };
    expect(panBy(v, 30, 0, 400).cx).toBe(970);
  });

  it("не даёт уехать за полюс", () => {
    const v = { cx: 1000, cy: 100, z: 2 };
    expect(panBy(v, 0, 9999, 400).cy).toBeGreaterThanOrEqual(200);
  });
});

describe("вспомогательное", () => {
  it("шаблон тайла подставляет z/x/y", () => {
    expect(tileUrl("https://t/{z}/{x}/{y}.png?key=K", { x: 2, y: 3, z: 4 })).toBe(
      "https://t/4/2/3.png?key=K",
    );
  });

  it("масштабная линейка берёт круглый шаг", () => {
    const s = scaleStep(3.6);
    expect(s.meters).toBe(200);
    expect(s.label).toBe("200 м");
    expect(scaleStep(100).label).toBe("10 км");
  });
});
