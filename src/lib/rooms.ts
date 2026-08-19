/**
 * Номера отеля (get_offer_details). Листинг отелей не знает ни про
 * кровати, ни про комнаты — эти данные живут только здесь, поэтому
 * фильтры «тип кровати» и «количество комнат» требуют догрузки деталей.
 */

export type BedType = "single" | "double" | "twin" | "unknown";

export interface RateSnapshot {
  offerpackHash?: string;
  price: number;
  currency: string;
  mealName?: string;
  breakfastIncluded?: boolean;
  refundable?: boolean;
  freeCancellation?: boolean;
  freeCancellationUntil?: string;
  checkoutUrl?: string;
}

export interface RoomSnapshot {
  name: string;
  description?: string;
  bedType: BedType;
  bedSummary?: string;
  /** Комнат в номере: из названия/описания; undefined — не указано */
  roomsCount?: number;
  sizeSqm?: number;
  maxOccupancy?: number;
  view?: string;
  amenities: string[];
  priceFrom?: number;
  rates: RateSnapshot[];
  photo?: string;
}

/**
 * «2-х комнатная квартира», «1-комнатные апартаменты», «с 2 комнатами»,
 * «Студия» → число. Источники перебираются по приоритету: название номера,
 * описание, затем название отеля — у квартир количество комнат часто
 * указано именно в названии объекта, а не номера.
 */
export function parseRoomsCount(...texts: Array<string | undefined>): number | undefined {
  const WORDS: Array<[RegExp, number]> = [
    [/однокомнатн/, 1],
    [/двухкомнатн|двух-комнатн/, 2],
    [/тр[её]хкомнатн/, 3],
    [/четыр[её]хкомнатн/, 4],
  ];
  for (const t of texts) {
    if (!t) continue;
    const s = t.toLowerCase();
    for (const [re, n] of WORDS) {
      if (re.test(s)) return n;
    }
    // «2-комнатная», «2-х комнатная», «2 комнатная»
    const dash = /(\d+)\s*(?:-|–)?\s*(?:х|x)?\s*-?\s*комнатн/.exec(s);
    if (dash) {
      const n = Number(dash[1]);
      if (Number.isFinite(n) && n > 0 && n < 10) return n;
    }
    // «с 2 комнатами», «2 комнаты»
    const with_ = /(?:с\s+)?(\d+)\s+комнат/.exec(s);
    if (with_) {
      const n = Number(with_[1]);
      if (Number.isFinite(n) && n > 0 && n < 10) return n;
    }
    if (/студи/.test(s)) return 1;
  }
  return undefined;
}

/** Тип кровати: поле MCP, иначе — из текстового описания. */
export function normalizeBedType(bedType?: string | null, bedSummary?: string | null): BedType {
  const raw = (bedType ?? "").toLowerCase();
  if (raw === "double") return "double";
  if (raw === "single") return "single";
  if (raw === "twin") return "twin";
  const s = (bedSummary ?? "").toLowerCase();
  if (/двуспальн|двухспальн|king|queen/.test(s)) return "double";
  if (/отдельные кровати|две односпальн|twin/.test(s)) return "twin";
  if (/односпальн/.test(s)) return "single";
  return "unknown";
}

export const BED_TYPES: Array<{ id: BedType; label: string }> = [
  { id: "single", label: "Односпальная" },
  { id: "double", label: "Двуспальная" },
];

export const ROOM_COUNTS: Array<{ id: number; label: string }> = [
  { id: 1, label: "1 комната" },
  { id: 2, label: "2 комнаты" },
  { id: 3, label: "3 и более" },
];

export function roomMatches(
  room: RoomSnapshot,
  beds: BedType[],
  counts: number[],
): boolean {
  if (beds.length > 0) {
    // «односпальная» засчитывает и раздельные кровати (twin)
    const ok = beds.some((b) =>
      b === "single" ? room.bedType === "single" || room.bedType === "twin" : room.bedType === b,
    );
    if (!ok) return false;
  }
  if (counts.length > 0) {
    const n = room.roomsCount;
    if (n === undefined) return false;
    const ok = counts.some((c) => (c >= 3 ? n >= 3 : n === c));
    if (!ok) return false;
  }
  return true;
}

/** Отель подходит, если хотя бы один его номер проходит условия. */
export function hotelMatchesRooms(
  rooms: RoomSnapshot[] | undefined,
  beds: BedType[],
  counts: number[],
): boolean {
  if (beds.length === 0 && counts.length === 0) return true;
  if (!rooms) return false; // детали ещё не загружены
  return rooms.some((r) => roomMatches(r, beds, counts));
}

export function bedLabel(bed: BedType): string {
  return (
    { single: "односпальная", double: "двуспальная", twin: "раздельные кровати", unknown: "" }[bed] ??
    ""
  );
}
