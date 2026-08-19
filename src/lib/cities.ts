import type { CityRef } from "./trip";

/**
 * Справочник городов MVP (дизайн-док: фиксированный список + ручной ввод).
 * Координаты — для карты; поиск MCP резолвит топонимы по имени сам.
 */
export interface City extends CityRef {
  lat: number;
  lng: number;
}

export const CITIES: Record<string, City> = {
  oskol: { name: "Старый Оскол", lat: 51.3, lng: 37.84 },
  moscow: { name: "Москва", lat: 55.76, lng: 37.62 },
  spb: { name: "Санкт-Петербург", lat: 59.94, lng: 30.31 },
  kazan: { name: "Казань", lat: 55.8, lng: 49.11 },
  istanbul: { name: "Стамбул", lat: 41.01, lng: 28.97 },
  porto: { name: "Порту", lat: 41.15, lng: -8.61 },
  lisbon: { name: "Лиссабон", lat: 38.72, lng: -9.14 },
  madrid: { name: "Мадрид", lat: 40.42, lng: -3.7 },
  valencia: { name: "Валенсия", lat: 39.47, lng: -0.38 },
  barcelona: { name: "Барселона", lat: 41.39, lng: 2.17 },
  paris: { name: "Париж", lat: 48.86, lng: 2.35 },
  rome: { name: "Рим", lat: 41.9, lng: 12.5 },
  belgrade: { name: "Белград", lat: 44.79, lng: 20.45 },
  yerevan: { name: "Ереван", lat: 40.18, lng: 44.51 },
  tbilisi: { name: "Тбилиси", lat: 41.72, lng: 44.83 },
  dubai: { name: "Дубай", lat: 25.2, lng: 55.27 },
  antalya: { name: "Анталья", lat: 36.9, lng: 30.7 },
};

export function findCity(name: string): City | undefined {
  const n = name.trim().toLowerCase();
  return Object.values(CITIES).find((c) => c.name.toLowerCase() === n);
}

/**
 * Координаты частых городов-пересадок: не показываются в селекте
 * добавления, но позволяют карте вести маршрут через точку пересадки
 * («Стамбул → Порту через Варшаву» ломается в Варшаве, а не летит прямой).
 */
const HUB_COORDS: Record<string, { lat: number; lng: number }> = {
  варшава: { lat: 52.23, lng: 21.01 },
  анкара: { lat: 39.93, lng: 32.86 },
  белград: { lat: 44.79, lng: 20.45 },
  баку: { lat: 40.41, lng: 49.87 },
  минск: { lat: 53.9, lng: 27.57 },
  "абу-даби": { lat: 24.45, lng: 54.38 },
  доха: { lat: 25.29, lng: 51.53 },
  шарджа: { lat: 25.35, lng: 55.42 },
  каир: { lat: 30.04, lng: 31.24 },
  франкфурт: { lat: 50.11, lng: 8.68 },
  мюнхен: { lat: 48.14, lng: 11.58 },
  вена: { lat: 48.21, lng: 16.37 },
  будапешт: { lat: 47.5, lng: 19.04 },
  бухарест: { lat: 44.43, lng: 26.1 },
  афины: { lat: 37.98, lng: 23.73 },
  хельсинки: { lat: 60.17, lng: 24.94 },
  рига: { lat: 56.95, lng: 24.11 },
  милан: { lat: 45.46, lng: 9.19 },
  рим: { lat: 41.9, lng: 12.5 },
  амстердам: { lat: 52.37, lng: 4.9 },
  лондон: { lat: 51.51, lng: -0.13 },
  кутаиси: { lat: 42.27, lng: 42.7 },
  алматы: { lat: 43.24, lng: 76.95 },
  астана: { lat: 51.17, lng: 71.43 },
  ташкент: { lat: 41.31, lng: 69.28 },
  бишкек: { lat: 42.87, lng: 74.59 },
  сочи: { lat: 43.6, lng: 39.73 },
  казань: { lat: 55.8, lng: 49.11 },
  екатеринбург: { lat: 56.84, lng: 60.6 },
  новосибирск: { lat: 55.03, lng: 82.92 },
};

/** Координаты по имени: справочник городов, затем хабы пересадок. */
export function resolveCoords(name: string): { lat: number; lng: number } | undefined {
  const c = findCity(name);
  if (c) return { lat: c.lat, lng: c.lng };
  return HUB_COORDS[name.trim().toLowerCase()];
}
