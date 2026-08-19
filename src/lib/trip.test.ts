import { describe, expect, it } from "vitest";
import {
  connectionWarnings,
  deriveStays,
  insertCity,
  legId,
  localDate,
  removeCity,
  stayKey,
  tripTotal,
  updateLeg,
  type Leg,
  type OfferSnapshot,
  type Trip,
} from "./trip";

const city = (name: string, geoId?: number) => ({ name, geoId });

function offer(departureAt: string, arrivalAt: string, price = 1000): OfferSnapshot {
  return {
    offerId: `${departureAt}-${arrivalAt}`,
    price,
    currency: "RUB",
    carriers: ["ФПК"],
    departureAt,
    arrivalAt,
    mode: "rail",
    checkoutRef: {},
  };
}

function leg(from: string, to: string, date: string, o?: OfferSnapshot): Leg {
  return { id: `${from}-${to}-${date}`, from: city(from), to: city(to), date, mode: "any", selectedOffer: o };
}

describe("localDate", () => {
  it("берёт календарную дату из локального времени, а не UTC", () => {
    // 00:30 по Москве = 21:30 предыдущего дня UTC — должна остаться 11-е
    expect(localDate("2026-09-11T00:30:00+03:00")).toBe("2026-09-11");
  });
});

describe("deriveStays", () => {
  it("ночной поезд с прибытием утром не создаёт ночёвку в городе прибытия за прошлый день", () => {
    const legs = [
      leg("Оскол", "Москва", "2026-09-10", offer("2026-09-10T23:52:00+03:00", "2026-09-11T09:25:00+03:00")),
      leg("Москва", "Стамбул", "2026-09-11", offer("2026-09-11T13:20:00+03:00", "2026-09-11T17:05:00+03:00")),
    ];
    // прибытие 11.09, вылет 11.09 → 0 ночей, Stay не создаётся
    expect(deriveStays(legs)).toHaveLength(0);
  });

  it("считает ночи между прибытием и следующим отправлением", () => {
    const legs = [
      leg("Москва", "Стамбул", "2026-09-11", offer("2026-09-11T13:20:00+03:00", "2026-09-11T17:05:00+03:00")),
      leg("Стамбул", "Порту", "2026-09-13", offer("2026-09-13T10:15:00+03:00", "2026-09-13T14:45:00+01:00")),
    ];
    const stays = deriveStays(legs);
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({ checkin: "2026-09-11", checkout: "2026-09-13", nights: 2 });
    expect(stays[0].city.name).toBe("Стамбул");
  });

  it("сохраняет выбранный отель, если ночёвка не изменилась", () => {
    const legs = [
      leg("Москва", "Стамбул", "2026-09-11", offer("2026-09-11T13:20:00+03:00", "2026-09-11T17:05:00+03:00")),
      leg("Стамбул", "Порту", "2026-09-13", offer("2026-09-13T10:15:00+03:00", "2026-09-13T14:45:00+01:00")),
    ];
    const first = deriveStays(legs);
    first[0].selectedHotel = {
      hotelId: "1", name: "Agora Life", price: 28228, currency: "RUB", checkoutRef: {},
    };
    const again = deriveStays(legs, first);
    expect(again[0].selectedHotel?.name).toBe("Agora Life");
  });

  it("заметка о городе переживает сдвиг дат — в отличие от отеля", () => {
    const legs = [
      leg("Москва", "Стамбул", "2026-09-11", offer("2026-09-11T13:20:00+03:00", "2026-09-11T17:05:00+03:00")),
      leg("Стамбул", "Порту", "2026-09-13", offer("2026-09-13T10:15:00+03:00", "2026-09-13T14:45:00+01:00")),
    ];
    const first = deriveStays(legs);
    first[0].note = { text: "Айя-София, Гранд-базар", source: "ai" };
    first[0].selectedHotel = { hotelId: "1", name: "Agora Life", price: 28228, currency: "RUB", checkoutRef: {} };
    const moved = [legs[0], leg("Стамбул", "Порту", "2026-09-14", offer("2026-09-14T10:15:00+03:00", "2026-09-14T14:45:00+01:00"))];
    const after = deriveStays(moved, first);
    expect(after[0].note?.text).toBe("Айя-София, Гранд-базар");
    expect(after[0].selectedHotel).toBeUndefined();
  });

  it("заметку удалённой ночёвки не воскрешает", () => {
    const legs = [
      leg("Москва", "Стамбул", "2026-09-11", offer("2026-09-11T13:20:00+03:00", "2026-09-11T17:05:00+03:00")),
      leg("Стамбул", "Порту", "2026-09-13", offer("2026-09-13T10:15:00+03:00", "2026-09-13T14:45:00+01:00")),
    ];
    const first = deriveStays(legs);
    first[0].note = undefined;
    expect(deriveStays(legs, first)[0].note).toBeUndefined();
  });

  it("сбрасывает отель, если даты ночёвки сдвинулись", () => {
    const legs = [
      leg("Москва", "Стамбул", "2026-09-11", offer("2026-09-11T13:20:00+03:00", "2026-09-11T17:05:00+03:00")),
      leg("Стамбул", "Порту", "2026-09-13", offer("2026-09-13T10:15:00+03:00", "2026-09-13T14:45:00+01:00")),
    ];
    const first = deriveStays(legs);
    first[0].selectedHotel = { hotelId: "1", name: "Agora Life", price: 28228, currency: "RUB", checkoutRef: {} };
    const moved = [legs[0], leg("Стамбул", "Порту", "2026-09-14", offer("2026-09-14T10:15:00+03:00", "2026-09-14T14:45:00+01:00"))];
    const after = deriveStays(moved, first);
    expect(after[0].nights).toBe(3);
    expect(after[0].selectedHotel).toBeUndefined();
  });
});

describe("connectionWarnings", () => {
  it("ловит невозможную стыковку (поезд уходит раньше прилёта)", () => {
    const legs = [
      leg("Барселона", "Москва", "2026-09-20", offer("2026-09-20T09:40:00+02:00", "2026-09-20T19:25:00+03:00")),
      leg("Москва", "Оскол", "2026-09-20", offer("2026-09-20T18:05:00+03:00", "2026-09-21T05:48:00+03:00")),
    ];
    const w = connectionWarnings(legs);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe("impossible");
    expect(w[0].message).toContain("1 ч 20 мин");
  });

  it("помечает узкую стыковку как tight", () => {
    const legs = [
      leg("A", "B", "2026-09-20", offer("2026-09-20T09:00:00+03:00", "2026-09-20T12:00:00+03:00")),
      leg("B", "C", "2026-09-20", offer("2026-09-20T13:00:00+03:00", "2026-09-20T15:00:00+03:00")),
    ];
    expect(connectionWarnings(legs)[0].kind).toBe("tight");
  });

  it("молчит при нормальном запасе", () => {
    const legs = [
      leg("A", "B", "2026-09-20", offer("2026-09-20T09:00:00+03:00", "2026-09-20T12:00:00+03:00")),
      leg("B", "C", "2026-09-21", offer("2026-09-21T13:00:00+03:00", "2026-09-21T15:00:00+03:00")),
    ];
    expect(connectionWarnings(legs)).toHaveLength(0);
  });

  it("игнорирует плечи без выбранного оффера", () => {
    expect(connectionWarnings([leg("A", "B", "2026-09-20"), leg("B", "C", "2026-09-20")])).toHaveLength(0);
  });
});

describe("мутации", () => {
  const base: Trip = {
    legs: [
      leg("Мадрид", "Барселона", "2026-09-18", offer("2026-09-18T08:35:00+02:00", "2026-09-18T10:45:00+02:00", 8591)),
    ],
    stays: [],
  };

  it("смена даты сбрасывает выбранный оффер", () => {
    const t = updateLeg(base, base.legs[0].id, { date: "2026-09-19" });
    expect(t.legs[0].selectedOffer).toBeUndefined();
    expect(t.legs[0].date).toBe("2026-09-19");
  });

  it("смена режима оффер не трогает", () => {
    const t = updateLeg(base, base.legs[0].id, { mode: "bus" });
    expect(t.legs[0].selectedOffer?.price).toBe(8591);
  });

  it("вставка города разбивает плечо надвое с mode='any'", () => {
    const t = insertCity(base, base.legs[0].id, city("Валенсия"), "2026-09-19");
    expect(t.legs.map((l) => `${l.from.name}→${l.to.name}`)).toEqual([
      "Мадрид→Валенсия",
      "Валенсия→Барселона",
    ]);
    expect(t.legs.every((l) => l.mode === "any")).toBe(true);
  });

  it("удаление города сливает смежные плечи", () => {
    const withV = insertCity(base, base.legs[0].id, city("Валенсия"), "2026-09-19");
    const back = removeCity(withV, city("Валенсия"));
    expect(back.legs).toHaveLength(1);
    expect(`${back.legs[0].from.name}→${back.legs[0].to.name}`).toBe("Мадрид→Барселона");
  });

  it("legId избегает коллизий", () => {
    const taken = new Set(["a-b-2026-09-18"]);
    expect(legId(city("a"), city("b"), "2026-09-18", taken)).toBe("a-b-2026-09-18-2");
  });
});

describe("stayKey", () => {
  it("нормализует город: ручная сборка ключа из имени не совпала бы", () => {
    const stay = { city: city("Стамбул"), checkin: "2026-09-11", checkout: "2026-09-13", nights: 2 };
    expect(stayKey(stay)).toBe("стамбул:2026-09-11:2026-09-13");
    expect(stayKey(stay)).not.toBe("Стамбул:2026-09-11:2026-09-13");
  });

  it("для города с geoId ключ строится по id", () => {
    const stay = { city: city("Стамбул", 2657208), checkin: "2026-09-11", checkout: "2026-09-13", nights: 2 };
    expect(stayKey(stay)).toBe("2657208:2026-09-11:2026-09-13");
  });
});

describe("tripTotal", () => {
  it("суммирует плечи и отели", () => {
    const trip: Trip = {
      legs: [leg("A", "B", "2026-09-10", offer("2026-09-10T10:00:00+03:00", "2026-09-10T12:00:00+03:00", 3075))],
      stays: [
        {
          city: city("B"), checkin: "2026-09-10", checkout: "2026-09-12", nights: 2,
          selectedHotel: { hotelId: "1", name: "H", price: 28228, currency: "RUB", checkoutRef: {} },
        },
      ],
    };
    expect(tripTotal(trip)).toBe(31303);
  });
});
