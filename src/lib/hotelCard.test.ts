import { describe, expect, it } from "vitest";
import { shortTime, toHotelCard, topAmenities, toReview } from "./hotelCard";

// Формы взяты из живого ответа mcp.tutu.ru (Хостел Bucoleon, 17.08.2026)
const RAW = {
  hotel_id: "7212410",
  name: "Хостел Bucoleon",
  address: "Турция, Kucukayasofya Mah. Cayiroglu Sk.,7, Стамбул",
  stars: 0,
  rating: 8.27,
  review_count: 10,
  phones: [],
  check_in_time: "14:00:00",
  check_out_time: "11:00:00",
  photos: ["https://cdn2.tu-tu.ru/a.jpg", "https://cdn2.tu-tu.ru/b.jpg"],
  photos_total: 24,
  amenity_groups: [
    { group_name: "Самые популярные удобства", amenities: ["Интернет", "Терраса", "Парковка"] },
    { group_name: "Интернет", amenities: ["Интернет"] },
    { group_name: "Пустая группа", amenities: [] },
  ],
  policy: [
    { title: "Питание", paragraphs: ["Информация о типе питания указана в деталях тарифа."] },
    { title: "Без текста", paragraphs: [] },
  ],
  location: { lat: 41.0028, lng: 28.97447, city: null },
  review_summary: {
    text: "Отлично",
    aspects: [
      { rating: 9.22, scale: 10, text: "Цена/Качество" },
      { rating: 8.44, scale: 10, text: "Чистота" },
      { text: "Без оценки" },
    ],
  },
};

describe("toHotelCard", () => {
  const card = toHotelCard(RAW);

  it("берёт полный адрес и время заезда без секунд", () => {
    expect(card.address).toContain("Cayiroglu");
    expect(card.checkInTime).toBe("14:00");
    expect(card.checkOutTime).toBe("11:00");
  });

  it("галерея знает, сколько фото всего", () => {
    expect(card.photos).toHaveLength(2);
    expect(card.photosTotal).toBe(24);
  });

  it("выбрасывает пустые группы удобств и правила без текста", () => {
    expect(card.amenityGroups.map((g) => g.name)).toEqual([
      "Самые популярные удобства",
      "Интернет",
    ]);
    expect(card.policies).toHaveLength(1);
  });

  it("full отдаёт удобства объектами, compact — строками; понимаем оба", () => {
    // реальная разница между view: в full это {id, name, icon}
    const objects = toHotelCard({
      amenity_groups: [
        {
          group_name: "Самые популярные удобства",
          amenities: [{ name: "Интернет" }, { name: "Парковка" }, {}],
        },
      ],
    });
    expect(objects.amenityGroups[0].items).toEqual(["Интернет", "Парковка"]);
  });

  it("аспект без оценки не показываем: рисовать нечего", () => {
    expect(card.aspects).toHaveLength(2);
    expect(card.aspects[0]).toMatchObject({ text: "Цена/Качество", rating: 9.22, scale: 10 });
  });

  it("координаты и словесная оценка", () => {
    expect(card.lat).toBe(41.0028);
    expect(card.ratingText).toBe("Отлично");
  });

  it("пустой ответ не роняет карточку", () => {
    const empty = toHotelCard({});
    expect(empty.name).toBe("Отель");
    expect(empty.photos).toEqual([]);
    expect(empty.amenityGroups).toEqual([]);
  });
});

describe("toReview", () => {
  const raw = {
    review_id: "bb0ff68c",
    rating: 8.7,
    created_at: "2026-05-29T00:00:00Z",
    author: "Tatiana",
    source: { id: "ostrovok", name: "Ostrovok" },
    trip: { kind: { id: "vacation", text: "Отдых" }, lineup: [{ id: "couple", text: "С близким человеком" }] },
    texts: [
      { sentiment: "pros", text: "Расположение отличное" },
      { sentiment: "cons", text: "Слышимость неимоверная" },
      { sentiment: "cons", text: "  " },
    ],
  };

  it("разделяет плюсы и минусы, пустые тексты выбрасывает", () => {
    const r = toReview(raw);
    expect(r.pros).toEqual(["Расположение отличное"]);
    expect(r.cons).toEqual(["Слышимость неимоверная"]);
    expect(r.date).toBe("2026-05-29");
    expect(r.tripKind).toBe("Отдых");
    expect(r.lineup).toEqual(["С близким человеком"]);
    expect(r.source).toBe("Ostrovok");
  });

  it("неразмеченный текст не теряется", () => {
    const r = toReview({ texts: [{ text: "Просто отзыв" }] }, 3);
    expect(r.plain).toEqual(["Просто отзыв"]);
    expect(r.id).toBe("review-3");
  });
});

describe("topAmenities", () => {
  it("берёт группу «самые популярные», а не первую попавшуюся", () => {
    const groups = [
      { name: "На территории", items: ["Лифт", "Банкомат"] },
      { name: "Самые популярные удобства", items: ["Интернет", "Парковка"] },
    ];
    expect(topAmenities(groups)).toEqual(["Интернет", "Парковка"]);
  });

  it("без такой группы — первая, и не бесконечно", () => {
    const groups = [{ name: "На территории", items: ["a", "b", "c"] }];
    expect(topAmenities(groups, 2)).toEqual(["a", "b"]);
    expect(topAmenities([], 2)).toEqual([]);
  });
});

describe("shortTime", () => {
  it("режет секунды и не выдумывает время", () => {
    expect(shortTime("14:00:00")).toBe("14:00");
    expect(shortTime("9:30")).toBe("09:30");
    expect(shortTime(null)).toBeUndefined();
    expect(shortTime("круглосуточно")).toBeUndefined();
  });
});
