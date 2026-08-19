import { describe, expect, it } from "vitest";
import { fitRect, HOME, priceLabelPos, project, svgTiles, WORLD } from "./geo";

describe("fitRect", () => {
  it("одна точка — окно минимальной ширины вокруг неё", () => {
    expect(fitRect([{ x: 500, y: 300 }], 0.62, 0, 0.2)).toEqual({
      x: 499.9,
      y: 300 - 0.062,
      w: 0.2,
      h: 0.124,
    });
  });

  it("разброс по горизонтали задаёт ширину, отступ добавляется долей", () => {
    expect(fitRect([{ x: 100, y: 100 }, { x: 200, y: 100 }], 0.5, 0.5)).toEqual({
      x: 75,
      y: 62.5,
      w: 150,
      h: 75,
    });
  });

  it("вертикальный разброс диктует ширину через соотношение сторон", () => {
    expect(fitRect([{ x: 100, y: 0 }, { x: 100, y: 100 }], 0.5, 0)).toEqual({
      x: 0,
      y: 0,
      w: 200,
      h: 100,
    });
  });

  it("без точек вписывать нечего", () => {
    expect(fitRect([], 0.62)).toBeNull();
  });
});

describe("svgTiles", () => {
  it("целый мир на экране 1024px — зум 2, сетка 4×3 видимых рядов", () => {
    const tiles = svgTiles({ x: 0, y: 0, w: 1000, h: 620 }, 1024);
    expect(tiles).toHaveLength(12);
    expect(tiles[0]).toEqual({ key: "2/0/0@0", x: 0, y: 0, z: 2, sx: 0, sy: 0, size: 250 });
    // последний ряд начинается на 500 — ниже 620 тайлы уже не видны
    expect(tiles.at(-1)).toMatchObject({ x: 3, y: 2, sy: 500 });
  });

  it("городской вид получает уличный зум", () => {
    const tiles = svgTiles({ x: 604, y: 312, w: 0.2, h: 0.124 }, 1500);
    expect(tiles[0].z).toBe(15);
  });

  it("зум не превышает предел тайл-сервера", () => {
    const tiles = svgTiles({ x: 604, y: 312, w: 0.001, h: 0.0006 }, 1500);
    expect(tiles[0].z).toBe(18);
  });

  it("долгота циклична: уехали за край мира — тайлы оборачиваются", () => {
    const tiles = svgTiles({ x: -50, y: 0, w: 1000, h: 620 }, 1024);
    const first = tiles.find((t) => t.sx === -250);
    expect(first).toMatchObject({ x: 3, z: 2 });
  });

  it("широта не циклична: выше края мира тайлов нет", () => {
    const tiles = svgTiles({ x: 0, y: -100, w: 1000, h: 120 }, 1024);
    expect(tiles.every((t) => t.sy >= 0)).toBe(true);
  });
});

describe("project (Меркатор)", () => {
  it("нулевая точка — центр мира", () => {
    expect(project(0, 0)).toEqual({ x: WORLD / 2, y: WORLD / 2 });
  });

  it("долгота линейна: антимеридианы — края мира", () => {
    expect(project(0, -180).x).toBe(0);
    expect(project(0, 180).x).toBe(WORLD);
  });

  it("широта по Меркатору: Москва севернее середины, y растёт к югу", () => {
    const moscow = project(55.75, 37.62);
    const istanbul = project(41.01, 28.96);
    expect(moscow.y).toBeLessThan(istanbul.y);
    expect(moscow.y).toBeCloseTo(312.6, 0);
  });

  it("домашний вид накрывает прежний регион: Лиссабон и Москва внутри", () => {
    for (const p of [project(38.7, -9.1), project(55.75, 37.62)]) {
      expect(p.x).toBeGreaterThan(HOME.x);
      expect(p.x).toBeLessThan(HOME.x + HOME.w);
      expect(p.y).toBeGreaterThan(HOME.y);
      expect(p.y).toBeLessThan(HOME.y + HOME.h);
    }
  });
});

describe("priceLabelPos", () => {
  it("наземное плечо: подпись над линией, на перпендикуляре от середины", () => {
    // горизонтальная линия: нормаль смотрит вверх (y меньше), зазор 10
    expect(priceLabelPos({ x: 0, y: 0 }, { x: 100, y: 0 }, "rail")).toEqual({ x: 50, y: -10 });
  });

  it("наземное плечо: сторона всегда верхняя, независимо от направления", () => {
    const ab = priceLabelPos({ x: 0, y: 0 }, { x: 100, y: 0 }, "rail");
    const ba = priceLabelPos({ x: 100, y: 0 }, { x: 0, y: 0 }, "rail");
    expect(ba).toEqual(ab);
  });

  it("вертикальная линия: подпись сбоку, с запасом на половину ширины текста", () => {
    const p = priceLabelPos({ x: 0, y: 0 }, { x: 0, y: 100 }, "bus");
    expect(p.y).toBe(50);
    // зазор 10 + 22 на пол-ширины ценника: центрированный текст не ляжет на линию
    expect(Math.abs(p.x)).toBe(32);
  });

  it("авиа: подпись снаружи дуги — за её вершиной, а не с противоположной стороны", () => {
    // горизонтальная дуга выгибается к нормали (0, 1): lift = min(100·0.22, 90) = 22,
    // вершина на 11 от хорды; дальше зазор 12 и поправка 8 на базовую линию текста
    expect(priceLabelPos({ x: 0, y: 0 }, { x: 100, y: 0 }, "avia")).toEqual({ x: 50, y: 31 });
  });

  it("экранный масштаб растит только зазор, не геометрию дуги", () => {
    const p = priceLabelPos({ x: 0, y: 0 }, { x: 100, y: 0 }, "avia", 2);
    // вершина дуги остаётся на 11, зазор и поправка удваиваются: 11 + (12+8)·2
    expect(p).toEqual({ x: 50, y: 51 });
  });
});
