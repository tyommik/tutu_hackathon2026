import { describe, expect, it } from "vitest";
import { accusative, inCity, prepositional } from "./morph";

describe("accusative", () => {
  it("«через X»: женские окончания меняются", () => {
    expect(accusative("Варшава")).toBe("Варшаву");
    expect(accusative("Москва")).toBe("Москву");
    expect(accusative("Барселона")).toBe("Барселону");
    expect(accusative("Валенсия")).toBe("Валенсию");
    expect(accusative("Анталья")).toBe("Анталью");
  });

  it("мужские и несклоняемые совпадают с именительным", () => {
    expect(accusative("Стамбул")).toBe("Стамбул");
    expect(accusative("Белград")).toBe("Белград");
    expect(accusative("Порту")).toBe("Порту");
    expect(accusative("Казань")).toBe("Казань");
    expect(accusative("Старый Оскол")).toBe("Старый Оскол");
  });

  it("латиницу не трогает", () => {
    expect(accusative("Barcelona")).toBe("Barcelona");
  });
});

describe("prepositional", () => {
  it("склоняет города демо-легенды", () => {
    expect(prepositional("Москва")).toBe("Москве");
    expect(prepositional("Стамбул")).toBe("Стамбуле");
    expect(prepositional("Лиссабон")).toBe("Лиссабоне");
    expect(prepositional("Барселона")).toBe("Барселоне");
    expect(prepositional("Мадрид")).toBe("Мадриде");
  });

  it("склоняет составные названия целиком", () => {
    expect(prepositional("Старый Оскол")).toBe("Старом Осколе");
    expect(prepositional("Нижний Новгород")).toBe("Нижнем Новгороде");
    expect(prepositional("Санкт-Петербург")).toBe("Санкт-Петербурге");
  });

  it("несклоняемые оставляет как есть", () => {
    expect(prepositional("Порту")).toBe("Порту");
    expect(prepositional("Осло")).toBe("Осло");
    expect(prepositional("Тбилиси")).toBe("Тбилиси");
    expect(prepositional("Сочи")).toBe("Сочи");
  });

  it("мягкий знак, -й и -ия", () => {
    expect(prepositional("Казань")).toBe("Казани");
    expect(prepositional("Дубай")).toBe("Дубае");
    expect(prepositional("Валенсия")).toBe("Валенсии");
  });

  it("одиночное прилагательное — тоже город", () => {
    expect(prepositional("Грозный")).toBe("Грозном");
  });

  it("латиницу не трогает", () => {
    expect(prepositional("Porto")).toBe("Porto");
  });

  it("inCity добавляет предлог", () => {
    expect(inCity("Москва")).toBe("в Москве");
    expect(inCity("Порту")).toBe("в Порту");
  });
});
