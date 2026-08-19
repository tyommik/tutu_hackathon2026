/**
 * Фильтры отелей. Почти всё умеет сам MCP (`filters_applied` в ответе
 * подтверждает применение) — сюда вынесены описание доступных значений
 * и клиентские фильтры по данным листинга.
 */

import type { HotelSnapshot } from "./trip";

export interface HotelFilters {
  /** ₽ за ночь; max уходит на сервер, min применяется клиентски */
  priceMin?: number;
  priceMax?: number;
  types: string[];
  stars: number[];
  meals: string[];
  minRating?: number;
  /** метры до центра; сравниваем с распарсенным адресом */
  maxToCenter?: number;
  freeCancellation: boolean;
  hotelAmenities: string[];
  roomAmenities: string[];
}

export const EMPTY_HOTEL_FILTERS: HotelFilters = {
  types: [],
  stars: [],
  meals: [],
  freeCancellation: false,
  hotelAmenities: [],
  roomAmenities: [],
};

/** Типы размещения (значения проверены на живом MCP). */
export const HOTEL_TYPES: Array<{ id: string; label: string }> = [
  { id: "hotel", label: "Отели" },
  { id: "apartments", label: "Квартиры" },
  { id: "aparthotel", label: "Апарт-отели" },
  { id: "guesthouse", label: "Гостевые дома" },
  { id: "hostel", label: "Хостелы" },
];

export const MEALS: Array<{ id: string; label: string }> = [
  { id: "breakfast", label: "Завтрак" },
  { id: "halfboard", label: "Завтрак и ужин" },
  { id: "fullboard", label: "Завтрак, обед и ужин" },
  { id: "allinclusive", label: "Всё включено" },
  { id: "lunch", label: "Обед" },
  { id: "dinner", label: "Ужин" },
];

export const RATINGS: Array<{ value: number | undefined; label: string }> = [
  { value: undefined, label: "Любой рейтинг" },
  { value: 7, label: "Выше 7" },
  { value: 8, label: "Выше 8" },
  { value: 9, label: "Выше 9" },
];

export const DISTANCES: Array<{ value: number | undefined; label: string }> = [
  { value: undefined, label: "Любое расстояние" },
  { value: 1000, label: "До 1 км" },
  { value: 3000, label: "До 3 км" },
  { value: 5000, label: "До 5 км" },
];

export const HOTEL_AMENITIES: Array<{ id: string; label: string }> = [
  { id: "pool", label: "Бассейн" },
  { id: "parking", label: "Парковка" },
  { id: "beach", label: "Пляж" },
  { id: "kitchen", label: "Кухня" },
  { id: "wifi", label: "Wi-Fi" },
];

export const ROOM_AMENITIES: Array<{ id: string; label: string }> = [
  { id: "balcony", label: "Балкон" },
  { id: "sea_view", label: "Вид на море" },
  { id: "view", label: "Красивый вид" },
];

export const STARS: Array<{ value: number; label: string }> = [
  { value: 5, label: "5★" },
  { value: 4, label: "4★" },
  { value: 3, label: "3★" },
  { value: 2, label: "2★" },
  { value: 1, label: "1★" },
  { value: 0, label: "Без звёзд" },
];

/** «778 м от центра» / «1,2 км от центра» → метры. */
export function parseDistanceToCenter(address?: string): number | undefined {
  if (!address) return undefined;
  // «км» проверяем раньше «м»; (?![а-яё]) отсекает «5 минут» и подобное.
  // \b тут не годится: в JS он ASCII-only и с кириллицей не срабатывает.
  const m = /([\d.,]+)\s*(км|м)(?![а-яё])/i.exec(address);
  if (!m) return undefined;
  const value = Number(m[1].replace(",", "."));
  if (!Number.isFinite(value)) return undefined;
  return m[2].toLowerCase() === "км" ? Math.round(value * 1000) : Math.round(value);
}

/** Аргументы серверных фильтров MCP из состояния формы. */
export function hotelSearchArgs(f: HotelFilters, nights: number): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  if (f.priceMax) args.price_max = f.priceMax;
  if (f.types.length) args.hotel_types = f.types;
  if (f.stars.length) args.stars = f.stars;
  if (f.meals.length) args.meals = f.meals;
  if (f.minRating) args.min_rating = f.minRating;
  if (f.freeCancellation) args.free_cancellation = true;
  if (f.hotelAmenities.length) args.hotel_amenities = f.hotelAmenities;
  if (f.roomAmenities.length) args.room_amenities = f.roomAmenities;
  void nights;
  return args;
}

/** Клиентская доводка: минимальная цена за ночь и расстояние до центра. */
export function applyHotelFilters(
  hotels: HotelSnapshot[],
  f: HotelFilters,
  nights: number,
): HotelSnapshot[] {
  const perNight = (h: HotelSnapshot) => (nights > 0 ? h.price / nights : h.price);
  return hotels.filter((h) => {
    if (f.priceMin && perNight(h) < f.priceMin) return false;
    if (f.maxToCenter) {
      const d = parseDistanceToCenter(h.address);
      if (d === undefined || d > f.maxToCenter) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: HotelFilters): number {
  return (
    (f.priceMin ? 1 : 0) +
    (f.priceMax ? 1 : 0) +
    f.types.length +
    f.stars.length +
    f.meals.length +
    (f.minRating ? 1 : 0) +
    (f.maxToCenter ? 1 : 0) +
    (f.freeCancellation ? 1 : 0) +
    f.hotelAmenities.length +
    f.roomAmenities.length
  );
}
