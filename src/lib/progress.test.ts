import { describe, expect, it } from "vitest";
import { pluralRu, searchProgress } from "./progress";

describe("searchProgress", () => {
  it("возвращает null, когда ни одно плечо не ищется", () => {
    expect(searchProgress([{ loading: false }, { loading: false }])).toBeNull();
  });

  it("считает, сколько плеч ищется, из скольких всего", () => {
    expect(searchProgress([{ loading: true }, { loading: true }, { loading: false }])).toEqual({
      searching: 2,
      total: 3,
    });
  });

  it("пустой маршрут — ничего не ищется", () => {
    expect(searchProgress([])).toBeNull();
  });
});

describe("pluralRu", () => {
  const forms: [string, string, string] = ["плечо", "плеча", "плеч"];

  it("склоняет по всем ветвям правила", () => {
    expect(pluralRu(1, forms)).toBe("плечо");
    expect(pluralRu(2, forms)).toBe("плеча");
    expect(pluralRu(5, forms)).toBe("плеч");
    // 11–14 — всегда родительный множественного, несмотря на последнюю цифру
    expect(pluralRu(11, forms)).toBe("плеч");
    expect(pluralRu(12, forms)).toBe("плеч");
    // а 21 и 22 снова как 1 и 2
    expect(pluralRu(21, forms)).toBe("плечо");
    expect(pluralRu(22, forms)).toBe("плеча");
  });
});
