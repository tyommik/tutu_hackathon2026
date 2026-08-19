import { fmtRub } from "./activityLog";
import type { Leg, Stay } from "./trip";

/**
 * Автоотчёт о результатах поиска — обратная связь копилоту.
 *
 * Черновик применяется без цен, а поиск идёт уже без участия модели, и до
 * сих пор она не узнавала, чем он закончился. Этот отчёт закрывает петлю:
 * когда все поиски по черновику затихли, стор отправляет модели текстовую
 * сводку (см. reviewResults в сторе), и та комментирует итог или чинит
 * маршрут встречным черновиком.
 *
 * Текст — единственный источник цен для ответа модели, поэтому сводка
 * собирается из фактического состояния плана, а не из ленты статусов.
 */

const MODE_LABEL: Record<string, string> = {
  avia: "авиа",
  rail: "поезд",
  bus: "автобус",
  etrain: "электричка",
};

/** Подбор пересадки по плечу — структурно совместим с LegTransferState стора. */
export interface ReportTransferState {
  loading?: boolean;
  options?: Array<{ hub: string; totalPrice: number }>;
}

export function searchReport(
  legs: Leg[],
  stays: Stay[],
  transfers: Record<string, ReportTransferState>,
  totalRub: number,
): string {
  const lines = ["Автоотчёт: поиск по черновику завершён.", "Плечи:"];

  for (const l of legs) {
    const head = `- ${l.date} ${l.from.name} → ${l.to.name}: `;
    const o = l.selectedOffer;
    if (o) {
      lines.push(`${head}${MODE_LABEL[o.mode] ?? o.mode}, ${fmtRub(o.price)}`);
      continue;
    }
    const via = transfers[l.id]?.options?.[0];
    lines.push(
      via
        ? `${head}прямых вариантов нет; есть пересадка через ${via.hub} за ` +
            `${fmtRub(via.totalPrice)} — применяется одной кнопкой в плане`
        : `${head}вариантов не нашлось`,
    );
  }

  if (stays.length > 0) {
    lines.push("Отели:");
    for (const s of stays) {
      const head = `- ${s.city.name}, ${s.nights} ноч. (${s.checkin}..${s.checkout}): `;
      const h = s.selectedHotel;
      lines.push(h ? `${head}${h.name}, ${fmtRub(h.price)}` : `${head}не нашлось`);
    }
  }

  lines.push(`Итого по плану: ${fmtRub(totalRub)}.`);
  return lines.join("\n");
}
