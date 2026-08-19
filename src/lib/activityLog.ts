import { accusative, inCity } from "./morph";
import { pluralRu } from "./progress";

/**
 * Журнал реальных шагов агента.
 *
 * Раньше ожидание закрывали заготовленные фразы «для красоты». Теперь каждый
 * настоящий шаг — запуск поиска плеча, находка, подбор пересадки, применение
 * черновика — становится статусом в чате копилота. Статусы не исчезают:
 * история копится, подряд идущие шаги UI сворачивает экспандером.
 *
 * Здесь только чистая часть: тексты статусов и группировка ленты сообщений.
 * Кто и когда пишет статусы — забота стора.
 */

export interface ChatMessage {
  role: "user" | "assistant" | "status";
  content: string;
}

export type ChatBlock =
  | { kind: "message"; index: number; message: ChatMessage }
  | { kind: "statuses"; index: number; items: string[] };

/**
 * Складывает подряд идущие статусы в группы, не трогая обычные сообщения.
 * index — позиция в исходной ленте (у группы — её первого статуса): по ней
 * UI держит состояние «развёрнут/свёрнут» устойчиво к дописыванию ленты.
 */
export function groupMessages(messages: ChatMessage[]): ChatBlock[] {
  const blocks: ChatBlock[] = [];
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (m.role !== "status") {
      blocks.push({ kind: "message", index: i, message: m });
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (last?.kind === "statuses") last.items.push(m.content);
    else blocks.push({ kind: "statuses", index: i, items: [m.content] });
  }
  return blocks;
}

/**
 * «12 400 ₽» с обычными пробелами. toLocaleString здесь не годится: он
 * разделяет разряды неразрывными пробелами разной ширины в зависимости от
 * версии ICU, и тексты статусов становились бы невоспроизводимыми в тестах.
 */
export function fmtRub(n: number): string {
  return `${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₽`;
}

const variants = (n: number) => `${n} ${pluralRu(n, ["вариант", "варианта", "вариантов"])}`;

export function legSearchingStatus(from: string, to: string): string {
  return `Ищем ${from} → ${to}…`;
}

export function legFoundStatus(from: string, to: string, price: number, count: number): string {
  return `${from} → ${to}: ${variants(count)} от ${fmtRub(price)}`;
}

export function legEmptyStatus(from: string, to: string): string {
  return `${from} → ${to}: прямых нет — подбираем пересадку`;
}

export function legErrorStatus(from: string, to: string): string {
  return `${from} → ${to}: поиск не удался`;
}

export function staySearchingStatus(city: string): string {
  return `Ищем отели ${inCity(city)}…`;
}

/** price не передан — у всей выдачи нет цен (Туту вернул отели без офферов). */
export function stayFoundStatus(city: string, price: number | undefined, count: number): string {
  const from = price === undefined ? "" : ` от ${fmtRub(price)}`;
  return `Отели ${inCity(city)}: ${variants(count)}${from}`;
}

export function stayEmptyStatus(city: string): string {
  return `Отели ${inCity(city)}: ничего не нашлось`;
}

export function transferSearchingStatus(from: string, to: string): string {
  return `${from} → ${to}: подбираем пересадку через хабы…`;
}

export function transferFoundStatus(
  from: string,
  to: string,
  hub: string,
  price: number,
): string {
  return `${from} → ${to}: есть пересадка через ${accusative(hub)}, от ${fmtRub(price)}`;
}

export function transferEmptyStatus(from: string, to: string): string {
  return `${from} → ${to}: пересадка через хабы не нашлась`;
}

export function draftStatus(legCount: number): string {
  return `Черновик применён: ${legCount} ${pluralRu(legCount, ["плечо", "плеча", "плеч"])} — запускаем поиск`;
}
