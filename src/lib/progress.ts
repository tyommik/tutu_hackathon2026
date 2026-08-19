/**
 * Счётчик хода поиска для поля статуса в шапке.
 *
 * Содержательную часть прогресса — «что уже нашли» — ведёт журнал статусов
 * (см. activityLog.ts): его последняя запись и показывается в шапке. Здесь
 * остаётся только арифметика «сколько плеч ещё ищем из скольких».
 */

export interface SearchCount {
  searching: number;
  total: number;
}

/** null — ничего не ищется, шапка живёт обычной жизнью. */
export function searchProgress(legs: Array<{ loading: boolean }>): SearchCount | null {
  const searching = legs.filter((l) => l.loading).length;
  if (searching === 0) return null;
  return { searching, total: legs.length };
}

/** «1 плечо, 2 плеча, 5 плеч»: формы — [один, два-четыре, много]. */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const tail = abs % 100;
  if (tail >= 11 && tail <= 14) return forms[2];
  const digit = abs % 10;
  if (digit === 1) return forms[0];
  if (digit >= 2 && digit <= 4) return forms[1];
  return forms[2];
}
