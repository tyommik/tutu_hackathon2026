import { describe, expect, it } from "vitest";
import {
  draftStatus,
  fmtRub,
  groupMessages,
  legEmptyStatus,
  legErrorStatus,
  legFoundStatus,
  legSearchingStatus,
  stayFoundStatus,
  staySearchingStatus,
  transferAppliedStatus,
  transferFoundStatus,
  transferSearchingStatus,
  type ChatMessage,
} from "./activityLog";

const u = (content: string): ChatMessage => ({ role: "user", content });
const a = (content: string): ChatMessage => ({ role: "assistant", content });
const st = (content: string): ChatMessage => ({ role: "status", content });

describe("groupMessages", () => {
  it("обычные сообщения проходят по одному, со своим индексом", () => {
    expect(groupMessages([u("привет"), a("здравствуйте")])).toEqual([
      { kind: "message", index: 0, message: u("привет") },
      { kind: "message", index: 1, message: a("здравствуйте") },
    ]);
  });

  it("подряд идущие статусы схлопываются в одну группу", () => {
    const blocks = groupMessages([u("собери"), st("шаг 1"), st("шаг 2"), a("готово")]);
    expect(blocks).toEqual([
      { kind: "message", index: 0, message: u("собери") },
      { kind: "statuses", index: 1, items: ["шаг 1", "шаг 2"] },
      { kind: "message", index: 3, message: a("готово") },
    ]);
  });

  it("статусы, разделённые сообщением, образуют отдельные группы", () => {
    const blocks = groupMessages([st("шаг 1"), u("вопрос"), st("шаг 2")]);
    expect(blocks).toEqual([
      { kind: "statuses", index: 0, items: ["шаг 1"] },
      { kind: "message", index: 1, message: u("вопрос") },
      { kind: "statuses", index: 2, items: ["шаг 2"] },
    ]);
  });

  it("пустой список — пустой результат", () => {
    expect(groupMessages([])).toEqual([]);
  });
});

describe("fmtRub", () => {
  it("группирует разряды обычным пробелом и округляет", () => {
    expect(fmtRub(12400)).toBe("12 400 ₽");
    expect(fmtRub(497)).toBe("497 ₽");
    expect(fmtRub(1234567.8)).toBe("1 234 568 ₽");
  });
});

describe("статусные строки", () => {
  it("поиск плеча", () => {
    expect(legSearchingStatus("Москва", "Стамбул")).toBe("Ищем Москва → Стамбул…");
  });

  it("находка по плечу со склонением вариантов", () => {
    expect(legFoundStatus("Москва", "Стамбул", 12400, 10)).toBe(
      "Москва → Стамбул: 10 вариантов от 12 400 ₽",
    );
    expect(legFoundStatus("Порту", "Лиссабон", 497, 1)).toBe(
      "Порту → Лиссабон: 1 вариант от 497 ₽",
    );
  });

  it("пустая выдача и ошибка по плечу", () => {
    expect(legEmptyStatus("Оскол", "Дубай")).toBe(
      "Оскол → Дубай: прямых нет — подбираем пересадку",
    );
    expect(legErrorStatus("Оскол", "Дубай")).toBe("Оскол → Дубай: поиск не удался");
  });

  it("отели с городом в предложном падеже", () => {
    expect(staySearchingStatus("Стамбул")).toBe("Ищем отели в Стамбуле…");
    expect(stayFoundStatus("Стамбул", 11883, 6)).toBe("Отели в Стамбуле: 6 вариантов от 11 883 ₽");
  });

  it("отели без цены в выдаче — статус без «от …»", () => {
    expect(stayFoundStatus("Стамбул", undefined, 6)).toBe("Отели в Стамбуле: 6 вариантов");
  });

  it("пересадка: применение с хабом в винительном падеже", () => {
    expect(transferAppliedStatus("Москва", "Бостон", "Стамбул")).toBe(
      "Москва → Бостон: ставим пересадку через Стамбул",
    );
    expect(transferAppliedStatus("Москва", "Бостон", "Варшава")).toBe(
      "Москва → Бостон: ставим пересадку через Варшаву",
    );
  });

  it("пересадка: подбор и находка", () => {
    expect(transferSearchingStatus("Оскол", "Дубай")).toBe(
      "Оскол → Дубай: подбираем пересадку через хабы…",
    );
    expect(transferFoundStatus("Оскол", "Дубай", "Стамбул", 47000)).toBe(
      "Оскол → Дубай: есть пересадка через Стамбул, от 47 000 ₽",
    );
  });

  it("черновик копилота со склонением плеч", () => {
    expect(draftStatus(6)).toBe("Черновик применён: 6 плеч — запускаем поиск");
    expect(draftStatus(1)).toBe("Черновик применён: 1 плечо — запускаем поиск");
  });
});
