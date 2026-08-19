import { NextResponse } from "next/server";
import { McpError } from "@/lib/mcp";
import { checkoutLink, searchLeg, searchStay } from "@/lib/search";
import { DEFAULT_PARTY, type Leg, type Party, type Stay } from "@/lib/trip";

export const dynamic = "force-dynamic";

interface CheckoutItem {
  id: string;
  label: string;
  kind: "leg" | "stay";
  plannedPrice: number;
  freshPrice?: number;
  diff?: number;
  checkoutUrl?: string;
  linkKind?: string;
  searchResultsUrl?: string;
  error?: string;
}

/**
 * «Checkout всего маршрута»: каждое плечо и отель пере-ищутся живьём,
 * затем строятся свежие ссылки. Ре-валидация встроена в сценарий —
 * протухание кэша перестаёт быть риском (дизайн-док).
 */
export async function POST(req: Request) {
  let trip: { legs: Leg[]; stays: Stay[]; party?: Party };
  try {
    trip = await req.json();
  } catch {
    return NextResponse.json({ error: "Ожидается JSON с legs и stays" }, { status: 400 });
  }
  if (!Array.isArray(trip?.legs)) {
    return NextResponse.json({ error: "Нужен массив legs" }, { status: 400 });
  }
  const party = trip.party ?? DEFAULT_PARTY;

  const items: CheckoutItem[] = [];

  for (const leg of trip.legs) {
    const item: CheckoutItem = {
      id: leg.id,
      kind: "leg",
      label: `${leg.from.name} → ${leg.to.name}`,
      plannedPrice: leg.selectedOffer?.price ?? 0,
    };
    try {
      const fresh = await searchLeg({
        origin: leg.from.name,
        destination: leg.to.name,
        date: leg.date,
        mode: leg.mode,
        party,
      });
      // тот же оффер, если ещё продаётся; иначе — лучший доступный
      const match =
        fresh.offers.find((o) => o.offerId === leg.selectedOffer?.offerId) ?? fresh.offers[0];
      if (!match) throw new Error("на эти даты предложений не осталось");
      // выбранный тариф (fare family) сохраняется при ре-валидации:
      // ищем тот же тариф в свежем оффере и берём его цену и хэши
      let freshRef = match.checkoutRef;
      let freshPrice = match.price;
      const wantFare = leg.selectedOffer?.chosenFare;
      if (wantFare && match.variants) {
        const v = match.variants.find((x) => x.fareFamily === wantFare);
        if (v) {
          freshPrice = v.price;
          freshRef = {
            ...freshRef,
            ...(v.offerHash !== undefined ? { offer_hash: v.offerHash } : {}),
            ...(v.serviceClass !== undefined ? { service_class: v.serviceClass } : {}),
          };
        }
      }
      item.freshPrice = freshPrice;
      item.diff = freshPrice - item.plannedPrice;
      item.searchResultsUrl = match.searchResultsUrl;
      // выбранные на схеме места уезжают в deeplink (rail поддерживает
      // предвыбор car_number + seat_numbers; при нехватке ref'ов ссылка
      // деградирует до страницы выбора мест — это ок)
      const ref =
        leg.seatChoice && match.mode === "rail"
          ? {
              ...freshRef,
              car_number: leg.seatChoice.carNumber,
              seat_numbers: leg.seatChoice.seatNumbers,
            }
          : freshRef;
      const link = await checkoutLink(ref);
      item.checkoutUrl = link.checkout_url;
      item.linkKind = link.kind;
    } catch (e) {
      item.error = e instanceof McpError || e instanceof Error ? e.message : String(e);
    }
    items.push(item);
  }

  for (const stay of trip.stays ?? []) {
    const item: CheckoutItem = {
      id: `${stay.city.name}:${stay.checkin}`,
      kind: "stay",
      label: `${stay.city.name}, ${stay.nights} ноч.`,
      plannedPrice: stay.selectedHotel?.price ?? 0,
    };
    try {
      const fresh = await searchStay(stay.city.name, stay.checkin, stay.checkout, 5, party);
      const match =
        fresh.hotels.find((h) => h.hotelId === stay.selectedHotel?.hotelId) ?? fresh.hotels[0];
      if (!match) throw new Error("свободных отелей не найдено");
      item.freshPrice = match.price;
      item.diff = match.price - item.plannedPrice;
      const link = await checkoutLink(match.checkoutRef);
      item.checkoutUrl = link.checkout_url;
      item.linkKind = link.kind;
    } catch (e) {
      item.error = e instanceof Error ? e.message : String(e);
    }
    items.push(item);
  }

  const money = (n: number) => Math.round(n * 100) / 100;
  for (const i of items) {
    if (i.freshPrice !== undefined) i.freshPrice = money(i.freshPrice);
    if (i.diff !== undefined) i.diff = money(i.diff);
  }
  const plannedTotal = money(items.reduce((a, i) => a + i.plannedPrice, 0));
  const freshTotal = money(items.reduce((a, i) => a + (i.freshPrice ?? i.plannedPrice), 0));
  return NextResponse.json({
    items,
    plannedTotal,
    freshTotal,
    diff: money(freshTotal - plannedTotal),
    failed: items.filter((i) => i.error).length,
  });
}
