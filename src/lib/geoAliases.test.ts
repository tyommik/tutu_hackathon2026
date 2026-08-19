import { describe, expect, it } from "vitest";
import { resolvedLabel, suggestDestination } from "./geoAliases";

describe("suggestDestination", () => {
  it("остров → город с аэропортом (реальный случай Бали → BLC)", () => {
    expect(suggestDestination("Бали")).toBe("Денпасар");
    expect(suggestDestination(" бали ")).toBe("Денпасар");
    expect(suggestDestination("Мальдивы")).toBe("Мале");
  });

  it("страна → главный хаб", () => {
    expect(suggestDestination("Таиланд")).toBe("Бангкок");
    expect(suggestDestination("тайланд")).toBe("Бангкок");
  });

  it("город с аэропортом подсказки не требует", () => {
    expect(suggestDestination("Денпасар")).toBeUndefined();
    expect(suggestDestination("Москва")).toBeUndefined();
    expect(suggestDestination("Бангкок")).toBeUndefined();
  });

  it("ё не мешает", () => {
    expect(suggestDestination("Шри-Ланка")).toBe("Коломбо");
  });
});

describe("resolvedLabel", () => {
  it("показывает, куда на самом деле ушёл поиск", () => {
    expect(resolvedLabel({ name: "Бали", iata: "BLC" })).toBe("Бали (BLC)");
    expect(resolvedLabel({ name: "Денпасар", iata: "DPS", region: "Бали провинция" })).toBe(
      "Денпасар (DPS, Бали провинция)",
    );
  });

  it("без имени подписи нет", () => {
    expect(resolvedLabel(undefined)).toBeUndefined();
    expect(resolvedLabel({ iata: "BLC" })).toBeUndefined();
  });
});
