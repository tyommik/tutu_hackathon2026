import type { UnavailableMode } from "./search";

/** ~горизонт продаж РЖД в днях */
export const RAIL_SALES_HORIZON_DAYS = 90;

/**
 * Человеческое объяснение пустой выдачи плеча по meta.unavailable из MCP
 * и эвристикам (горизонт продаж РЖД). Пустая выдача без причины — главный
 * анти-паттерн UX по дизайн-доку.
 */
export function explainEmptyLeg(
  unavailable: UnavailableMode[],
  date: string,
  today: Date = new Date(),
): { reasons: string[]; hubSplit: boolean; horizon: boolean } {
  const reasons: string[] = [];
  let noAirport = false;

  for (const u of unavailable) {
    const detail = u.detail ?? "";
    if (u.mode === "avia" && detail.includes("avia_id")) {
      noAirport = true;
      reasons.push("рядом с одним из городов нет аэропорта — прямых авиарейсов не бывает");
    } else if (u.mode === "railway" && detail.includes("railway_id")) {
      reasons.push("ж/д за пределами России Туту не продаёт");
    } else if (u.reason === "no_route") {
      reasons.push(`${modeName(u.mode)}: маршрута нет`);
    }
  }

  const daysAhead = Math.round((Date.parse(`${date}T00:00:00`) - today.getTime()) / 86_400_000);
  const horizon = daysAhead > RAIL_SALES_HORIZON_DAYS;
  if (horizon) {
    reasons.push(
      `дата через ${daysAhead} дн. — продажи поездов и части рейсов ещё не открыты (обычно ~${RAIL_SALES_HORIZON_DAYS} дней)`,
    );
  }

  if (reasons.length === 0) reasons.push("Туту ничего не нашёл на эту дату");
  return { reasons, hubSplit: noAirport, horizon };
}

function modeName(mode: string): string {
  return (
    { avia: "самолёт", railway: "поезд", bus: "автобус", etrain: "электричка" }[mode] ?? mode
  );
}
