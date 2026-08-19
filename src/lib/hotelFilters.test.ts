import { describe, expect, it } from "vitest";
import {
  activeFilterCount,
  applyHotelFilters,
  EMPTY_HOTEL_FILTERS,
  hotelSearchArgs,
  parseDistanceToCenter,
} from "./hotelFilters";
import type { HotelSnapshot } from "./trip";

function hotel(name: string, price: number, address?: string): HotelSnapshot {
  return { hotelId: name, name, price, currency: "RUB", checkoutRef: {}, address };
}

describe("parseDistanceToCenter", () => {
  it("метры и километры, включая запятую", () => {
    expect(parseDistanceToCenter("778 м от центра")).toBe(778);
    expect(parseDistanceToCenter("1,2 км от центра")).toBe(1200);
    expect(parseDistanceToCenter("2.5 км от центра")).toBe(2500);
  });

  it("без расстояния — undefined", () => {
    expect(parseDistanceToCenter("ул. Баумана, 5")).toBeUndefined();
    expect(parseDistanceToCenter(undefined)).toBeUndefined();
  });
});

describe("hotelSearchArgs", () => {
  it("собирает только заданные серверные фильтры MCP", () => {
    const args = hotelSearchArgs(
      {
        ...EMPTY_HOTEL_FILTERS,
        priceMax: 5000,
        types: ["apartments"],
        stars: [4, 5],
        meals: ["breakfast"],
        minRating: 8,
        freeCancellation: true,
        hotelAmenities: ["pool"],
        roomAmenities: ["balcony"],
      },
      2,
    );
    expect(args).toEqual({
      price_max: 5000,
      hotel_types: ["apartments"],
      stars: [4, 5],
      meals: ["breakfast"],
      min_rating: 8,
      free_cancellation: true,
      hotel_amenities: ["pool"],
      room_amenities: ["balcony"],
    });
  });

  it("пустые фильтры не отправляются", () => {
    expect(hotelSearchArgs(EMPTY_HOTEL_FILTERS, 2)).toEqual({});
  });

  it("priceMin остаётся клиентским (MCP умеет только price_max)", () => {
    expect(hotelSearchArgs({ ...EMPTY_HOTEL_FILTERS, priceMin: 2000 }, 2)).toEqual({});
  });
});

describe("applyHotelFilters", () => {
  const hotels = [
    hotel("дёшево у центра", 4000, "500 м от центра"),
    hotel("дорого далеко", 20000, "4 км от центра"),
    hotel("без адреса", 10000),
  ];

  it("минимальная цена считается за ночь", () => {
    // 4000 за 2 ночи = 2000/ночь → отсекается порогом 3000
    const r = applyHotelFilters(hotels, { ...EMPTY_HOTEL_FILTERS, priceMin: 3000 }, 2);
    expect(r.map((h) => h.name)).toEqual(["дорого далеко", "без адреса"]);
  });

  it("расстояние до центра: без данных отель не проходит фильтр", () => {
    const r = applyHotelFilters(hotels, { ...EMPTY_HOTEL_FILTERS, maxToCenter: 1000 }, 2);
    expect(r.map((h) => h.name)).toEqual(["дёшево у центра"]);
  });

  it("без фильтров возвращает всё", () => {
    expect(applyHotelFilters(hotels, EMPTY_HOTEL_FILTERS, 2)).toHaveLength(3);
  });
});

describe("activeFilterCount", () => {
  it("считает все активные условия", () => {
    expect(activeFilterCount(EMPTY_HOTEL_FILTERS)).toBe(0);
    expect(
      activeFilterCount({
        ...EMPTY_HOTEL_FILTERS,
        priceMax: 5000,
        stars: [4, 5],
        freeCancellation: true,
        hotelAmenities: ["pool"],
      }),
    ).toBe(5);
  });
});
