/**
 * ИИ-копилот «Тропы» (дизайн-док, контракт /api/assist).
 * OpenAI-совместимый chat completions через OpenRouter. Три роли:
 * 1) черновик маршрута — инструмент propose_trip (без доступа к MCP);
 * 2) комментарий к плану — бюджет, узкие стыковки, советы по датам;
 * 3) тур-места — знания LLM, в UI помечаются «советы ИИ».
 * Премиса 4: копилот — надстройка; без ключа/при падении LLM ручной
 * режим не затронут.
 */

import {
  connectionWarnings,
  partyLabel,
  tripTotal,
  type Party,
  type Trip,
} from "./trip";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "openai/gpt-4o-mini";

export interface DraftLeg {
  from: string;
  to: string;
  date: string;
  mode?: "rail" | "avia" | "bus" | "any";
}

/** Действие «применить уже найденную пересадку» для плеча from → to. */
export interface TransferAction {
  from: string;
  to: string;
  /** Город пересадки из отчёта — когда система нашла несколько вариантов. */
  hub?: string;
}

export interface AssistResult {
  reply: string;
  proposal?: { legs: DraftLeg[]; party?: Party };
  /** Действия модели над планом; при встречном черновике игнорируются. */
  actions?: TransferAction[];
}

export class AssistUnavailable extends Error {}

const SYSTEM_PROMPT = `Ты — копилот «Тропы», конструктора планирования путешествий на данных Туту.
Пользователь собирает мультигородской маршрут; система сама ищет реальные
билеты и отели после любого изменения плана.

Правила:
- Если пользователь просит построить или изменить маршрут — вызови инструмент
  propose_trip с ПОЛНЫМ новым списком плеч (from/to — названия городов
  по-русски, date — YYYY-MM-DD, mode только если пользователь настаивает на
  виде транспорта, иначе "any"). Черновик без цен: цены найдёт система.
- ЧЕРНОВИК СНАЧАЛА, УТОЧНЕНИЯ ПОТОМ: НИКОГДА не переспрашивай даты перед
  построением и не предлагай выбор вместо черновика. Не хватает данных —
  возьми разумное сам, вызови propose_trip и одной фразой скажи, что
  подставил и что это меняется в плане. Размытый месяц («в сентябре») —
  середина месяца; «на выходных», «на майских» — ближайшие подходящие даты;
  не названа длительность — 5-7 ночей на город по смыслу поездки; не назван
  состав — оставь прежний. Спросить вместо черновика можно ровно в двух
  случаях: непонятно, КУДА человек едет, или не назван и никак не выводится
  город отправления (плана нет, в истории его не было) — откуда человек едет,
  выдумывать нельзя. Всё остальное подставляй сам.
- СОСТАВ: если в запросе есть, сколько человек едет («вдвоём», «с женой»,
  «семьёй 2+2», «с ребёнком 5 лет»), передай в propose_trip adults и
  children_ages — от этого зависят цены всех поисков. Дети 0-17 лет идут
  возрастами в children_ages, остальные — в adults. Не упомянули состав —
  поля не передавай, останется прежний.
- Учитывай географию: соседние города соединяй наземным транспортом, дальние —
  самолётом ("any" позволяет системе выбрать самой). Поезда за пределами
  России Туту не продаёт.
- Пересадку, которую система уже нашла для плеча без прямых вариантов,
  применяй инструментом apply_transfer (города плеча как в плане) — это
  ставит найденные рейсы как есть. Не пересобирай ради неё маршрут.
- ХАБЫ ОБЯЗАТЕЛЬНЫ В ОБЕ СТОРОНЫ: если у города нет аэропорта (Манжерок,
  Старый Оскол, Белгород и любые малые города) — НИКОГДА не строй из него ИЛИ
  В НЕГО дальнее либо международное авиаплечо напрямую. Правило одинаково для
  отправления и для НАЗНАЧЕНИЯ: «Москва → малый город» — такая же ошибка, как
  «малый город → Дубай». Не жди уточнений и не предлагай прямое плечо
  «город — город»: сразу раскладывай малый город в полную цепочку через хаб —
  ближайший к нему город с аэропортом (для европейской России обычно Москва):
  1) наземное плечо малый город → хаб, mode "rail" или "any";
  2) перелёт из хаба (малый город — отправление) или в хаб (малый город —
     назначение);
  3) финальное наземное плечо хаб → малый город, если тот в конце маршрута.
  Отправление: Старый Оскол → Дубай = [Старый Оскол → Москва] + [Москва → Дубай].
  Назначение: Дубай → Старый Оскол = [Дубай → Москва] + [Москва → Старый Оскол].
- Горизонт продаж: билеты на поезда открываются примерно за 90 дней, часть
  авиарейсов — за 6-9 месяцев. Дата дальше 90 дней — всё равно собери черновик
  и в том же ответе предупреди, что поезда на неё могут ещё не продаваться
  (поиск честно покажет, что уже в продаже). Черновик вместо вопроса.
- Даты: сегодняшняя дата приходит отдельным системным сообщением. Считай
  относительные формулировки («в следующие выходные», «через месяц», «в
  сентябре») от неё и НИКОГДА не предлагай прошедшие даты — если названный
  месяц уже прошёл, бери его в следующем году и скажи об этом. Точную дату
  подставляй сам и говори какую, а не спрашивай.
- НИКОГДА не называй конкретные цены и время рейсов от себя — они приходят
  только из поиска Туту. Про бюджет говори на основе контекста плана ниже.
- Комментируя план: оцени бюджет, обрати внимание на узкие стыковки из
  контекста, предложи, что улучшить (перестановки/даты может проверить
  оптимизатор).
- Тур-места (достопримечательности, еда) советуй свободно из своих знаний —
  это твоя зона, помечать не нужно, UI сам подпишет «советы ИИ».
- Вопрос «что посмотреть в городе» обычно приходит из карточки плана, и ответ
  ложится в заметку к ней. Отвечай маркированным списком: место — одна строка
  зачем и сколько времени занимает. Без цен и расписаний, маршрут не трогай.
- Отвечай кратко, по-русски, без воды. 2-5 предложений, если не просят больше.`;

/**
 * Режим осмысления: черновик применён, автопоиск завершился, и модель впервые
 * видит, чем он закончился. Отчёт приходит user-сообщением, но написан
 * системой — без этой рамки модель отвечала бы «пользователю», который
 * ничего не писал.
 */
const REVIEW_PROMPT = `Сейчас придёт автоотчёт системы поиска по применённому черновику — это
не сообщение пользователя, а обратная связь тебе. Осмысли результаты и
ответь пользователю: коротко скажи, что нашлось, что нет, назови итоговый
бюджет из отчёта. Если видишь проблему, которую решает изменение маршрута
(плечо совсем без вариантов, город явно не распознан, неудачная дата), —
вызови propose_trip с исправленным ПОЛНЫМ списком плеч и одной фразой
объясни, что и зачем поменял. Если отчёт говорит, что для плеча без прямых
вариантов система УЖЕ НАШЛА пересадку («есть пересадка через X»), — твоя
задача её ПОСТАВИТЬ: вызови apply_transfer с городами этого плеча, а не
пересобирай маршрут и не оставляй решение пользователю. Если всё в
порядке — только прокомментируй. Цены называй только из отчёта.`;

const PROPOSE_TRIP_TOOL = {
  type: "function",
  function: {
    name: "propose_trip",
    description:
      "Предложить черновик маршрута: полный упорядоченный список плеч. Вызывай при любой просьбе построить/изменить маршрут.",
    parameters: {
      type: "object",
      properties: {
        adults: {
          type: "integer",
          minimum: 1,
          maximum: 9,
          description: "взрослых (12+); передавать, только если состав назван",
        },
        children_ages: {
          type: "array",
          items: { type: "integer", minimum: 0, maximum: 17 },
          description: "возрасты детей 0-17 лет",
        },
        legs: {
          type: "array",
          items: {
            type: "object",
            properties: {
              from: { type: "string", description: "город отправления, по-русски" },
              to: { type: "string", description: "город прибытия, по-русски" },
              date: { type: "string", description: "дата отправления YYYY-MM-DD" },
              mode: { type: "string", enum: ["rail", "avia", "bus", "any"] },
            },
            required: ["from", "to", "date"],
          },
        },
      },
      required: ["legs"],
    },
  },
} as const;

const APPLY_TRANSFER_TOOL = {
  type: "function",
  function: {
    name: "apply_transfer",
    description:
      "Применить уже НАЙДЕННУЮ системой пересадку для плеча без прямых вариантов: " +
      "плечо заменится двумя с теми самыми рейсами, что нашла система. Вызывай, " +
      "когда отчёт говорит «есть пересадка через X», или когда пользователь просит " +
      "её поставить. Не перестраивай ради этого маршрут через propose_trip.",
    parameters: {
      type: "object",
      properties: {
        from: { type: "string", description: "город отправления плеча, как в плане" },
        to: { type: "string", description: "город прибытия плеча, как в плане" },
        hub: { type: "string", description: "город пересадки из отчёта, если вариантов несколько" },
      },
      required: ["from", "to"],
    },
  },
} as const;

/**
 * Действие модели «поставить пересадку». Мусор отбрасываем молча, как и в
 * validateParty: битый hub не отменяет действие — систему выберет лучший.
 */
export function validateTransferAction(raw: unknown): TransferAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { from, to, hub } = raw as Record<string, unknown>;
  if (typeof from !== "string" || typeof to !== "string" || !from.trim() || !to.trim()) return null;
  return {
    from: from.trim(),
    to: to.trim(),
    ...(typeof hub === "string" && hub.trim() ? { hub: hub.trim() } : {}),
  };
}

/** Компактный текстовый контекст плана для LLM. */
export function buildTripContext(trip: Trip, party?: Party): string {
  const head = party ? `Состав: ${partyLabel(party)}.` : "";
  if (trip.legs.length === 0) return [head, "План пока пуст."].filter(Boolean).join("\n");
  const lines: string[] = head ? [head] : [];
  for (const l of trip.legs) {
    const o = l.selectedOffer;
    lines.push(
      `- ${l.date} ${l.from.name} → ${l.to.name}` +
        (o ? ` (${o.mode}, ${Math.round(o.price)} ₽, ${o.departureAt.slice(11, 16)}→${o.arrivalAt.slice(11, 16)})` : " (поиск не завершён)"),
    );
  }
  for (const s of trip.stays) {
    lines.push(
      `- отель в ${s.city.name} ${s.checkin}..${s.checkout} (${s.nights} ноч.` +
        (s.selectedHotel ? `, ${s.selectedHotel.name}, ${Math.round(s.selectedHotel.price)} ₽)` : ", подбирается)"),
    );
  }
  const warns = connectionWarnings(trip.legs);
  for (const w of warns) lines.push(`! стыковка: ${w.message}`);
  lines.push(`Итого бюджет плана: ${Math.round(tripTotal(trip))} ₽.`);
  return lines.join("\n");
}

/** Сегодняшняя дата для LLM: без неё модель путает год и «выходные». */
export function todayContext(now: Date = new Date()): string {
  const iso = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const human = new Intl.DateTimeFormat("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now);
  const horizon = new Date(now.getTime() + 90 * 86_400_000).toISOString().slice(0, 10);
  return (
    `Сегодня: ${iso} (${human}). Все относительные даты считай от неё; ` +
    `прошедшие даты не предлагай. Поезда обычно в продаже до ${horizon}.`
  );
}

/**
 * Состав из черновика LLM. Молча игнорируем мусор: лучше прежний состав,
 * чем поиск на восьмерых из-за галлюцинации модели.
 */
export function validateParty(raw: unknown): Party | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const { adults, children_ages: kids } = raw as Record<string, unknown>;
  const ages = Array.isArray(kids)
    ? kids.filter((a): a is number => typeof a === "number" && Number.isInteger(a) && a >= 0 && a <= 17)
    : [];
  const okAdults = typeof adults === "number" && Number.isInteger(adults) && adults >= 1 && adults <= 9;
  // состав не назван — не трогаем текущий
  if (!okAdults && ages.length === 0) return undefined;
  return { adults: okAdults ? (adults as number) : 1, childrenAges: ages.slice(0, 8) };
}

/** Родительный падеж: «15 июня», а не «15 июнь». */
const MONTHS_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

/**
 * Сводка собранного черновика — ответ на случай, когда модель вызвала
 * инструмент и не написала ничего своего.
 *
 * Даты здесь обязательны: копилот подставляет их сам, когда назван только
 * месяц, и без них человек не узнает, на какое число собран план. Строка
 * собирается из самого черновика, поэтому не зависит от того, что модель
 * решила написать в этот раз.
 */
export function draftSummary(legs: DraftLeg[], today: Date = new Date()): string {
  const cities = [legs[0].from, ...legs.map((l) => l.to)];
  const route =
    cities.length > 6
      // счётчик появляется от шести плеч, а validateDraft не пускает больше
      // четырнадцати — на всём этом диапазоне форма одна, «плеч»
      ? `${cities[0]} → … → ${cities[cities.length - 1]}, ${legs.length} плеч`
      : cities.join(" → ");

  const dates = [...new Set(legs.map((l) => l.date))].sort();
  const when = dates.length === 1 ? day(dates[0], today) : span(dates[0], dates[dates.length - 1], today);

  return `Собрал черновик: ${route}, ${when}. Даты и города правятся в плане.`;
}

/** «15 сентября», с годом — только если он не нынешний. */
function day(iso: string, today: Date): string {
  const [y, m, d] = iso.split("-").map(Number);
  const tail = y === today.getFullYear() ? "" : ` ${y}`;
  return `${d} ${MONTHS_GEN[m - 1]}${tail}`;
}

/** «15–20 сентября» внутри одного месяца, иначе через тире полностью. */
function span(a: string, b: string, today: Date): string {
  const [ya, ma, da] = a.split("-").map(Number);
  const [yb, mb] = b.split("-").map(Number);
  if (ya === yb && ma === mb) return `${da}–${day(b, today)}`;
  return `${day(a, today)} — ${day(b, today)}`;
}

export function validateDraft(raw: unknown): DraftLeg[] | null {
  if (typeof raw !== "object" || raw === null) return null;
  const legs = (raw as { legs?: unknown }).legs;
  if (!Array.isArray(legs) || legs.length === 0 || legs.length > 14) return null;
  const out: DraftLeg[] = [];
  for (const l of legs) {
    const { from, to, date, mode } = (l ?? {}) as Record<string, unknown>;
    if (typeof from !== "string" || typeof to !== "string" || !from.trim() || !to.trim()) return null;
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
    const m = mode === "rail" || mode === "avia" || mode === "bus" ? mode : "any";
    out.push({ from: from.trim(), to: to.trim(), date, mode: m });
  }
  return out;
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function assist(
  message: string,
  trip: Trip,
  history: ChatMessage[] = [],
  party?: Party,
  kind?: "review",
): Promise<AssistResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new AssistUnavailable(
      "ИИ-копилот отключён: не задан OPENROUTER_API_KEY. Ручной режим работает полностью.",
    );
  }
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

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
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "system", content: todayContext() },
        { role: "system", content: `Текущий план:\n${buildTripContext(trip, party)}` },
        ...(kind === "review" ? [{ role: "system", content: REVIEW_PROMPT } as const] : []),
        ...history.slice(-8),
        { role: "user", content: message },
      ],
      tools: [PROPOSE_TRIP_TOOL, APPLY_TRANSFER_TOOL],
      temperature: 0.4,
      // reasoning-модели (DeepSeek v4, o-серия) тратят токены на размышления
      // ДО ответа — низкий лимит съедался целиком и tool call не успевал
      max_tokens: 64_000,
      reasoning: { effort: "low" },
    }),
    // 180 с: обычный вопрос укладывается в 7-17, но развёрнутый план на две
    // недели по часам в минуту не влезал и возвращался ошибкой обрыва.
    // Верхняя граница здесь — maxDuration маршрута, а за ним nginx с 320 с.
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new AssistUnavailable(`ИИ не ответил (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null;
        tool_calls?: Array<{ function?: { name?: string; arguments?: string } }>;
      };
    }>;
  };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new AssistUnavailable("ИИ вернул пустой ответ");

  const call = msg.tool_calls?.find((t) => t.function?.name === "propose_trip");
  if (call?.function?.arguments) {
    try {
      const args = JSON.parse(call.function.arguments);
      const legs = validateDraft(args);
      if (legs) {
        const draftParty = validateParty(args);
        return {
          reply: msg.content?.trim() || draftSummary(legs),
          proposal: { legs, ...(draftParty ? { party: draftParty } : {}) },
        };
      }
    } catch {
      // некорректные аргументы инструмента — падаем в текстовый ответ
    }
  }

  const actions = (msg.tool_calls ?? [])
    .filter((t) => t.function?.name === "apply_transfer")
    .map((t) => {
      try {
        return validateTransferAction(JSON.parse(t.function!.arguments ?? ""));
      } catch {
        return null;
      }
    })
    .filter((a): a is TransferAction => a !== null);
  if (actions.length > 0) {
    return {
      reply: msg.content?.trim() || "Ставлю найденную пересадку в план.",
      actions,
    };
  }

  return { reply: msg.content?.trim() || "Не понял запрос — уточните, что поменять в маршруте." };
}
