import { describe, expect, it } from "vitest";
import {
  hotelMatchesRooms,
  normalizeBedType,
  parseRoomsCount,
  roomMatches,
  type RoomSnapshot,
} from "./rooms";

function room(p: Partial<RoomSnapshot>): RoomSnapshot {
  return { name: "Номер", bedType: "unknown", amenities: [], rates: [], ...p };
}

describe("parseRoomsCount", () => {
  it("разбирает реальные названия номеров Туту", () => {
    expect(parseRoomsCount("1-комнатные апартаменты, 35м²")).toBe(1);
    expect(parseRoomsCount("2-х комнатная квартира на улице Баумана")).toBe(2);
    expect(parseRoomsCount("Трёхкомнатные апартаменты")).toBe(3);
    expect(parseRoomsCount("Студия с видом на город")).toBe(1);
  });

  it("«двухместные» — это про людей, а не комнаты", () => {
    expect(parseRoomsCount("Двухместные апартаменты L")).toBeUndefined();
  });

  it("ищет по нескольким полям и возвращает undefined, если нет данных", () => {
    expect(parseRoomsCount("Апартаменты", "• 2-комнатная планировка")).toBe(2);
    expect(parseRoomsCount("Апартаменты", undefined)).toBeUndefined();
  });

  it("берёт число комнат из названия объекта, когда у номера его нет", () => {
    // реальный случай Туту: отель «2-х комнатная квартира», номер «Апартаменты»
    expect(parseRoomsCount("Апартаменты", undefined, "2-х комнатная квартира на улице Баумана")).toBe(2);
    expect(parseRoomsCount("Апартаменты", undefined, "Однокомнатная квартира на Адмиралтейской")).toBe(1);
  });

  it("понимает «с N комнатами»", () => {
    expect(parseRoomsCount("Апартаменты Superior с 2 комнатами с балконом")).toBe(2);
  });
});

describe("normalizeBedType", () => {
  it("поле MCP имеет приоритет", () => {
    expect(normalizeBedType("double", null)).toBe("double");
    expect(normalizeBedType("twin", null)).toBe("twin");
  });

  it("падает на текстовое описание, когда поля нет", () => {
    expect(normalizeBedType(null, "Двуспальная кровать ・ Диван")).toBe("double");
    expect(normalizeBedType(null, "Две односпальные кровати")).toBe("twin");
    expect(normalizeBedType(null, "Односпальная кровать")).toBe("single");
    expect(normalizeBedType(null, null)).toBe("unknown");
  });
});

describe("roomMatches / hotelMatchesRooms", () => {
  const dbl2 = room({ bedType: "double", roomsCount: 2 });
  const twin1 = room({ bedType: "twin", roomsCount: 1 });
  const unknown = room({});

  it("двуспальная кровать", () => {
    expect(roomMatches(dbl2, ["double"], [])).toBe(true);
    expect(roomMatches(twin1, ["double"], [])).toBe(false);
  });

  it("«односпальная» засчитывает раздельные кровати", () => {
    expect(roomMatches(twin1, ["single"], [])).toBe(true);
  });

  it("«3 и более» — это >= 3", () => {
    expect(roomMatches(room({ roomsCount: 4 }), [], [3])).toBe(true);
    expect(roomMatches(dbl2, [], [3])).toBe(false);
    expect(roomMatches(dbl2, [], [2])).toBe(true);
  });

  it("номер без данных о комнатах не проходит фильтр по комнатам", () => {
    expect(roomMatches(unknown, [], [1])).toBe(false);
  });

  it("отель проходит, если подходит хотя бы один номер", () => {
    expect(hotelMatchesRooms([twin1, dbl2], ["double"], [2])).toBe(true);
    expect(hotelMatchesRooms([twin1], ["double"], [])).toBe(false);
  });

  it("без фильтров детали не нужны, с фильтрами — обязательны", () => {
    expect(hotelMatchesRooms(undefined, [], [])).toBe(true);
    expect(hotelMatchesRooms(undefined, ["double"], [])).toBe(false);
  });
});
