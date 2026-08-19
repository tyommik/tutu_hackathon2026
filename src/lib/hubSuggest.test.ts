import { describe, expect, it } from "vitest";
import { INTL_RU_HUBS, buildHubPrompt, parseHubs } from "./hubSuggest";

describe("buildHubPrompt", () => {
  it("называет оба города и просит строгий JSON", () => {
    const p = buildHubPrompt("Горно-Алтайск", "Воронеж");
    expect(p).toContain("Горно-Алтайск");
    expect(p).toContain("Воронеж");
    expect(p).toContain('{"hubs":');
  });

  it("подсказывает международные хабы России", () => {
    const p = buildHubPrompt("Москва", "Порту");
    for (const hub of INTL_RU_HUBS) expect(p).toContain(hub);
  });
});

describe("parseHubs", () => {
  it("разбирает чистый JSON", () => {
    expect(parseHubs('{"hubs":["Новосибирск","Москва"]}')).toEqual([
      "Новосибирск",
      "Москва",
    ]);
  });

  it("срезает markdown-ограду", () => {
    expect(parseHubs('```json\n{"hubs":["Стамбул"]}\n```')).toEqual(["Стамбул"]);
  });

  it("выкидывает дубли и пустые строки, режет до пяти", () => {
    const raw = '{"hubs":["Москва","Москва","  ","Казань","Пекин","Доха","Дубай","Ереван"]}';
    expect(parseHubs(raw)).toEqual(["Москва", "Казань", "Пекин", "Доха", "Дубай"]);
  });

  it("мусор любого вида — null, сигнал для фолбэка", () => {
    expect(parseHubs("извините, не могу")).toBeNull();
    expect(parseHubs('{"hubs":"Москва"}')).toBeNull();
    expect(parseHubs('{"hubs":[]}')).toBeNull();
    expect(parseHubs('{"hubs":[42]}')).toBeNull();
  });
});
