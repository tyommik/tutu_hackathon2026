/**
 * Интеллектуальный подбор хабов-кандидатов для разбивки плеча.
 *
 * LLM только ПРЕДЛАГАЕТ города — проверяет их всё равно MCP реальными
 * поисками, так что галлюцинация стоит два лишних запроса, а не неверный
 * ответ пользователю (осознанное исключение из правила «LLM только для
 * объяснений»: на корректность цен и маршрутов модель повлиять не может).
 * Без ключа, при таймауте или мусорном ответе вызывающий код откатывается
 * на статический HUBS — поведение ровно прежнее.
 */

import { cacheKey, cached } from "./cache";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/**
 * НЕ OPENROUTER_MODEL: копилот может сидеть на reasoning-модели
 * (deepseek-v4-flash отвечает 9-36 с — таймаут съедался целиком), а
 * подбору хабов хватает быстрой мелкой модели за 1-2 с. Переопределение —
 * TROPA_HUB_MODEL.
 */
const DEFAULT_MODEL = "openai/gpt-4o-mini";
/** Дольше ждать нет смысла: фолбэк на статический список дешевле ожидания. */
const TIMEOUT_MS = 10_000;
const MAX_HUBS = 5;

/** Через какие международные хабы сейчас обычно летают в Россию и из неё. */
export const INTL_RU_HUBS = [
  "Стамбул",
  "Белград",
  "Доха",
  "Ереван",
  "Пекин",
  "Дубай",
  "Аддис-Абеба",
];

/**
 * Промпт: просим хабы под конкретную пару городов. Подсказку про
 * международные хабы России даём всегда — применима ли она, модель
 * решает сама по географии маршрута.
 */
export function buildHubPrompt(from: string, to: string): string {
  return [
    `Пассажир едет из города ${from} в город ${to}. Прямых рейсов и поездов нет.`,
    `Назови от 3 до ${MAX_HUBS} городов-хабов, через которые реалистичнее всего`,
    "собрать маршрут с пересадкой (самолёт и/или поезд), в порядке убывания",
    "перспективности. Учитывай реальную географию и действующие транспортные",
    "сети. Если маршрут международный и один из концов в России, учти, что",
    `в Россию и из России сейчас обычно летают через: ${INTL_RU_HUBS.join(", ")}.`,
    "Если конец маршрута — региональный город России без действующих",
    "международных рейсов, первым или последним звеном обычно идёт домашний",
    "хаб (Москва или Санкт-Петербург) — включай его в список.",
    'Ответ строго JSON без пояснений: {"hubs":["Город1","Город2"]}',
  ].join(" ");
}

/**
 * Разбор ответа модели: срезаем ```-ограду, парсим, оставляем непустые
 * строки без дублей. Мусор в любом виде → null (сигнал для фолбэка).
 */
export function parseHubs(text: string): string[] | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  let data: unknown;
  try {
    data = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const hubs = (data as { hubs?: unknown })?.hubs;
  if (!Array.isArray(hubs)) return null;
  const out: string[] = [];
  for (const h of hubs) {
    if (typeof h !== "string") continue;
    const name = h.trim();
    if (name && !out.includes(name)) out.push(name);
  }
  return out.length > 0 ? out.slice(0, MAX_HUBS) : null;
}

/**
 * Хабы от LLM для пары городов, null — «не вышло, берите статический
 * список». Кэш по паре: кандидаты от даты не зависят.
 */
export async function suggestHubs(from: string, to: string): Promise<string[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  const model = process.env.TROPA_HUB_MODEL ?? DEFAULT_MODEL;

  try {
    const { value } = await cached(cacheKey("suggest_hubs", { from, to, model }), async () => {
      const res = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://tropa.example",
          "X-Title": "Tropa trip planner",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: buildHubPrompt(from, to) }],
          temperature: 0,
          // reasoning-модели тратят токены на размышления до ответа —
          // низкий лимит съедался бы целиком (см. assist.ts)
          max_tokens: 16_000,
          reasoning: { effort: "low" },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const hubs = parseHubs(data.choices?.[0]?.message?.content ?? "");
      if (!hubs) throw new Error("мусорный ответ");
      return hubs;
    });
    return value;
  } catch {
    // любой сбой LLM — не наша проблема: работаем со статическим списком
    return null;
  }
}
