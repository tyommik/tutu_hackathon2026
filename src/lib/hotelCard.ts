/**
 * Карточка отеля из get_offer_details (view='full').
 * Туту отдаёт заметно больше, чем видно в списке: галерею, удобства
 * группами, правила, оценки по аспектам и тексты отзывов с разделением на
 * плюсы и минусы. Здесь — разбор сырого ответа в то, что рисует UI.
 */

export interface AmenityGroup {
  name: string;
  items: string[];
}

export interface HotelPolicy {
  title: string;
  paragraphs: string[];
}

export interface RatingAspect {
  text: string;
  rating: number;
  /** Шкала Туту — почти всегда 10, но не выдумываем её сами. */
  scale: number;
}

export interface HotelCard {
  hotelId: string;
  name: string;
  /** Полный почтовый адрес — в списке приходит только «1.1 км от центра». */
  address?: string;
  stars?: number;
  rating?: number;
  /** Словесная оценка Туту: «Отлично». */
  ratingText?: string;
  reviewCount?: number;
  checkInTime?: string;
  checkOutTime?: string;
  photos: string[];
  photosTotal?: number;
  amenityGroups: AmenityGroup[];
  policies: HotelPolicy[];
  aspects: RatingAspect[];
  phones: string[];
  lat?: number;
  lng?: number;
}

export interface HotelReview {
  id: string;
  author?: string;
  /** YYYY-MM-DD — дата отзыва. */
  date?: string;
  rating?: number;
  /** «Отдых», «Командировка» — тип поездки автора. */
  tripKind?: string;
  /** «С близким человеком», «С детьми». */
  lineup: string[];
  source?: string;
  pros: string[];
  cons: string[];
  /** Текст без разметки на плюсы/минусы, если Туту не разделил. */
  plain: string[];
}

export interface RawHotelInfo {
  hotel_id?: string;
  name?: string;
  address?: string | null;
  stars?: number | null;
  rating?: number | null;
  review_count?: number | null;
  check_in_time?: string | null;
  check_out_time?: string | null;
  photos?: string[] | null;
  photos_total?: number | null;
  phones?: Array<string | { number?: string }> | null;
  /**
   * compact отдаёт удобства строками, full — объектами {id, name, icon}.
   * Разбираем оба вида: иначе карточка молча остаётся без удобств.
   */
  amenity_groups?: Array<{
    group_name?: string;
    amenities?: Array<string | { name?: string }>;
  }> | null;
  policy?: Array<{ title?: string; paragraphs?: string[] }> | null;
  location?: { lat?: number | null; lng?: number | null } | null;
  review_summary?: {
    text?: string | null;
    aspects?: Array<{ text?: string; rating?: number; scale?: number }> | null;
  } | null;
}

export interface RawReview {
  review_id?: string;
  author?: string | null;
  created_at?: string | null;
  rating?: number | null;
  source?: { name?: string } | null;
  trip?: { kind?: { text?: string } | null; lineup?: Array<{ text?: string }> | null } | null;
  texts?: Array<{ sentiment?: string; text?: string }> | null;
}

/** «14:00:00» → «14:00»; мусор пропускаем, а не показываем как есть. */
export function shortTime(t?: string | null): string | undefined {
  if (!t) return undefined;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : undefined;
}

export function toHotelCard(raw: RawHotelInfo): HotelCard {
  const groups = (raw.amenity_groups ?? [])
    .map((g) => ({
      name: g.group_name ?? "",
      items: (g.amenities ?? [])
        .map((a) => (typeof a === "string" ? a : a?.name))
        .filter((x): x is string => !!x && x.length > 0),
    }))
    .filter((g) => g.items.length > 0);

  return {
    hotelId: raw.hotel_id ?? "",
    name: raw.name ?? "Отель",
    address: raw.address ?? undefined,
    stars: raw.stars ?? undefined,
    rating: raw.rating ?? undefined,
    ratingText: raw.review_summary?.text ?? undefined,
    reviewCount: raw.review_count ?? undefined,
    checkInTime: shortTime(raw.check_in_time),
    checkOutTime: shortTime(raw.check_out_time),
    photos: (raw.photos ?? []).filter((p): p is string => typeof p === "string"),
    photosTotal: raw.photos_total ?? undefined,
    amenityGroups: groups,
    policies: (raw.policy ?? [])
      .map((p) => ({
        title: p.title ?? "",
        paragraphs: (p.paragraphs ?? []).map((x) => x.trim()).filter(Boolean),
      }))
      .filter((p) => p.paragraphs.length > 0),
    aspects: (raw.review_summary?.aspects ?? [])
      .filter((a) => typeof a.rating === "number" && a.text)
      .map((a) => ({ text: a.text!, rating: a.rating!, scale: a.scale ?? 10 })),
    phones: (raw.phones ?? [])
      .map((p) => (typeof p === "string" ? p : p?.number))
      .filter((x): x is string => !!x),
    lat: raw.location?.lat ?? undefined,
    lng: raw.location?.lng ?? undefined,
  };
}

export function toReview(raw: RawReview, ix = 0): HotelReview {
  const texts = (raw.texts ?? []).filter((t) => t.text?.trim());
  const pick = (s: string) =>
    texts.filter((t) => t.sentiment === s).map((t) => t.text!.trim());
  return {
    id: raw.review_id ?? `review-${ix}`,
    author: raw.author ?? undefined,
    date: raw.created_at ? raw.created_at.slice(0, 10) : undefined,
    rating: raw.rating ?? undefined,
    tripKind: raw.trip?.kind?.text ?? undefined,
    lineup: (raw.trip?.lineup ?? []).map((l) => l.text).filter((x): x is string => !!x),
    source: raw.source?.name ?? undefined,
    pros: pick("pros"),
    cons: pick("cons"),
    // «Туту не разметил» — не повод потерять текст
    plain: texts
      .filter((t) => t.sentiment !== "pros" && t.sentiment !== "cons")
      .map((t) => t.text!.trim()),
  };
}

/** Самые популярные удобства идут первыми — их и показываем свёрнутыми. */
export function topAmenities(groups: AmenityGroup[], limit = 8): string[] {
  const popular = groups.find((g) => /популярн/i.test(g.name));
  const source = popular ?? groups[0];
  return (source?.items ?? []).slice(0, limit);
}
