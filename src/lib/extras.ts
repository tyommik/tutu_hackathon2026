/**
 * Свои траты в плане: такси до вокзала, виза, страховка, багаж.
 *
 * Туту их не продаёт и знать о них не может, но в бюджете поездки они есть
 * — и без них итог всегда занижен. Трата прикрепляется к карточке плана
 * (после какой она идёт), хранит исходную сумму в своей валюте и рубли по
 * курсу ЦБ на момент добавления.
 */

import type { Converted } from "./rates";

export interface Extra {
  id: string;
  /** «Такси», «Виза» — из пресетов или своё. */
  label: string;
  amount: number;
  currency: string;
  /** Рубли по курсу на момент добавления; undefined — курса не было. */
  rub?: number;
  /** Сколько рублей за единицу валюты. */
  rate?: number;
  /** Дата курса ЦБ. */
  rateDate?: string;
  /** Карточка, после которой стоит трата: 'origin' | legId | stayKey. */
  afterId: string;
}

/**
 * Подсказки по типу траты: транспорт, потом деньги на месте, потом
 * оформление поездки. Список открытый — поле принимает и свой текст.
 */
export const EXTRA_PRESETS = [
  "Такси",
  "Транспорт",
  "Аренда авто",
  "Поесть",
  "Достопримечательности",
  "Мероприятия",
  "Покупки",
  "Виза",
  "Страховка",
  "Багаж",
  "Прочее",
];

export function extraId(taken: Set<string> = new Set()): string {
  let i = 1;
  while (taken.has(`extra-${i}`)) i++;
  return `extra-${i}`;
}

export function makeExtra(
  input: { label: string; amount: number; currency: string; afterId: string },
  converted: Converted | null,
  taken?: Set<string>,
): Extra {
  return {
    id: extraId(taken),
    label: input.label.trim() || "Расход",
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    afterId: input.afterId,
    ...(converted
      ? { rub: converted.rub, rate: converted.rate, rateDate: converted.rateDate }
      : {}),
  };
}

/** Сумма трат в рублях. Непересчитанные не выдумываем — их считаем отдельно. */
export function extrasTotal(extras: Extra[]): number {
  return extras.reduce((a, e) => a + (e.rub ?? 0), 0);
}

/** Траты, которые не удалось пересчитать: бюджет должен об этом сказать. */
export function unconvertedExtras(extras: Extra[]): Extra[] {
  return extras.filter((e) => e.rub === undefined);
}

/** Траты, прикреплённые к конкретной карточке, в порядке добавления. */
export function extrasAfter(extras: Extra[], afterId: string): Extra[] {
  return extras.filter((e) => e.afterId === afterId);
}
