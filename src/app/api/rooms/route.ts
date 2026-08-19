import { NextResponse } from "next/server";
import { callTool, McpError } from "@/lib/mcp";
import { cacheKey, cached } from "@/lib/cache";
import {
  toHotelCard,
  toReview,
  type RawHotelInfo,
  type RawReview,
} from "@/lib/hotelCard";
import { normalizeBedType, parseRoomsCount, type RoomSnapshot } from "@/lib/rooms";
import { DEFAULT_PARTY, type Party } from "@/lib/trip";

export const dynamic = "force-dynamic";
export const maxDuration = 120;
/** Отзывов за раз: столько влезает в карточку без «простыни». */
const REVIEW_PAGE = 5;

interface RawRate {
  offerpack_hash?: string;
  price?: { amount?: number; currency?: string };
  meal?: { name?: string; included?: boolean } | null;
  breakfast_included?: boolean | null;
  refundable?: boolean | null;
  free_cancellation?: boolean | null;
  free_cancellation_until?: string | null;
  checkout_url?: string;
}

interface RawRoom {
  room_name?: string;
  room_description?: string;
  bed_type?: string | null;
  bed_summary?: string | null;
  room_size_sqm?: number | null;
  max_occupancy?: number | null;
  view?: string | null;
  room_amenities?: Array<{ name?: string }>;
  room_property_items?: Array<{ text?: string }>;
  price_from?: { amount?: number };
  photos?: string[];
  rates?: RawRate[];
}

function toRoom(r: RawRoom, hotelName?: string): RoomSnapshot {
  const name = r.room_name ?? "Номер";
  return {
    name,
    description: r.room_description ?? undefined,
    bedType: normalizeBedType(r.bed_type, r.bed_summary),
    bedSummary: r.bed_summary ?? undefined,
    // у квартир число комнат нередко только в названии объекта
    roomsCount: parseRoomsCount(name, r.room_description ?? undefined, hotelName),
    sizeSqm: r.room_size_sqm ?? undefined,
    maxOccupancy: r.max_occupancy ?? undefined,
    view: r.view ?? undefined,
    amenities: [
      ...(r.room_amenities ?? []).map((a) => a.name).filter((x): x is string => !!x),
      ...(r.room_property_items ?? []).map((p) => p.text).filter((x): x is string => !!x),
    ],
    priceFrom: r.price_from?.amount,
    photo: r.photos?.[0],
    rates: (r.rates ?? []).map((rate) => ({
      offerpackHash: rate.offerpack_hash,
      price: rate.price?.amount ?? 0,
      currency: rate.price?.currency ?? "RUB",
      mealName: rate.meal?.name ?? undefined,
      breakfastIncluded: rate.breakfast_included ?? undefined,
      refundable: rate.refundable ?? undefined,
      freeCancellation: rate.free_cancellation ?? undefined,
      freeCancellationUntil: rate.free_cancellation_until ?? undefined,
      checkoutUrl: rate.checkout_url,
    })),
  };
}

/**
 * Детали отеля. Два режима:
 * - compact (по умолчанию) — только номера, им кормятся фильтры по кроватям
 *   и комнатам, которые дёргают до 20 отелей разом;
 * - full — карточка отеля: галерея, удобства, правила, аспекты рейтинга и
 *   тексты отзывов. Тяжелее втрое, поэтому только по открытию карточки.
 */
export async function POST(req: Request) {
  let body: {
    hotelId?: string;
    checkin?: string;
    checkout?: string;
    party?: Party;
    view?: "compact" | "full";
    reviewOffset?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON" }, { status: 400 });
  }
  const { hotelId, checkin, checkout } = body;
  if (!hotelId || !checkin || !checkout) {
    return NextResponse.json({ error: "Нужны hotelId, checkin и checkout" }, { status: 400 });
  }
  const party = body.party ?? DEFAULT_PARTY;
  const full = body.view === "full";
  const args = {
    product_type: "hotels",
    offer_id: hotelId,
    check_in: checkin,
    check_out: checkout,
    adults: party.adults,
    ...(party.childrenAges.length ? { children_ages: party.childrenAges } : {}),
    ...(full
      ? { view: "full", review_limit: REVIEW_PAGE, review_offset: Math.max(0, body.reviewOffset ?? 0) }
      : {}),
  };

  try {
    const { value } = await cached(cacheKey("get_offer_details", args), () =>
      callTool<{
        rooms?: RawRoom[];
        hotel?: RawHotelInfo & {
          reviews?: {
            reviews?: RawReview[];
            total_reviews?: number;
            pagination?: { has_more?: boolean; next_offset?: number };
          } | null;
        };
      }>("get_offer_details", args),
    );
    const hotelName = value.hotel?.name;
    const rooms = (value.rooms ?? []).map((r) => toRoom(r, hotelName));
    if (!full) return NextResponse.json({ rooms, hotelName });

    const rv = value.hotel?.reviews;
    return NextResponse.json({
      rooms,
      hotelName,
      hotel: toHotelCard(value.hotel ?? {}),
      reviews: (rv?.reviews ?? []).map(toReview),
      reviewsTotal: rv?.total_reviews ?? 0,
      reviewsHasMore: rv?.pagination?.has_more ?? false,
      reviewsNextOffset: rv?.pagination?.next_offset ?? 0,
    });
  } catch (e) {
    if (e instanceof McpError) {
      return NextResponse.json({ error: `Туту не ответил: ${e.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
