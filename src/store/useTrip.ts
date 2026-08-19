"use client";

import { create } from "zustand";
import {
  connectionWarnings,
  deriveStays,
  DEFAULT_PARTY,
  legId,
  slug,
  stayKey,
  tripTotal,
  type CityRef,
  type ConnectionWarning,
  type HotelSnapshot,
  type Leg,
  type Mode,
  type Note,
  type OfferSnapshot,
  type Party,
  type Stay,
} from "@/lib/trip";
import { firstFeasible, planRepairs } from "@/lib/repair";
import { extrasTotal, makeExtra, type Extra } from "@/lib/extras";
import type { ResolvedGeo } from "@/lib/geoAliases";
import { toRub, type Rates } from "@/lib/rates";
import type { TransferOption } from "@/lib/transfers";
import { partyOf, STATE_VERSION, type Skeleton } from "@/lib/persist";
import { cityOf } from "@/lib/aviaFilters";
import { CITIES, findCity, resolveCoords, type City } from "@/lib/cities";
import legendData from "@/lib/legend.json";

export type FetchStatus = "idle" | "loading" | "ready" | "empty" | "error";

export interface LegTransferState {
  loading: boolean;
  options?: TransferOption[];
  hubsTried?: string[];
  error?: string;
}

/** Три размера окна копилота: кнопка, окно у угла, колонка вровень с планом. */
export type CopilotSize = "collapsed" | "normal" | "large";

export interface CheckoutItem {
  id: string;
  label: string;
  kind: "leg" | "stay" | "extra";
  plannedPrice: number;
  freshPrice?: number;
  diff?: number;
  checkoutUrl?: string;
  searchResultsUrl?: string;
  error?: string;
}

export interface CheckoutResult {
  items: CheckoutItem[];
  plannedTotal: number;
  freshTotal: number;
  diff: number;
  failed: number;
}

export interface OptimizeSuggestion {
  label: string;
  legs: Array<{ from: { name: string }; to: { name: string }; date: string; mode: Mode }>;
  price: number;
  minutes: number;
  deltaPrice: number;
  deltaMinutes: number;
}

export interface OptimizeResponse {
  current: { price: number; minutes: number } | null;
  suggestions: OptimizeSuggestion[];
  combinations: number;
  uniqueSearches: number;
  tookMs: number;
  error?: string;
}

interface TripState {
  legs: Leg[];
  stays: Stay[];
  /**
   * Начальная точка маршрута. Живёт в сторе, а не в модуле: первый
   * добавленный город ещё не образует плечо, но должен быть виден в плане
   * и на карте — иначе клик «добавить город» выглядит как промах.
   */
  origin: { city: CityRef; date: string; note?: Note } | null;
  party: Party;
  legStatus: Record<string, FetchStatus>;
  legOffers: Record<string, OfferSnapshot[]>;
  legUnavailable: Record<string, Array<{ mode: string; reason?: string; detail?: string }>>;
  /** Как Туту понял города плеча — из meta поиска. */
  legResolved: Record<string, { from?: ResolvedGeo; to?: ResolvedGeo }>;
  /** Модал пересадки: только «что открыто», данные — в legTransfers. */
  transfer: { open: boolean; legId?: string };
  /**
   * Результаты подбора пересадки по плечам. Ключ — id плеча (в нём города
   * и дата), записи не чистятся: повторное появление того же плеча получает
   * готовый результат мгновенно.
   */
  legTransfers: Record<string, LegTransferState>;
  stayStatus: Record<string, FetchStatus>;
  stayHotels: Record<string, HotelSnapshot[]>;
  checkout: { open: boolean; loading: boolean; result?: CheckoutResult };
  optimizer: { open: boolean; loading: boolean; result?: OptimizeResponse };
  copilot: {
    messages: Array<{ role: "user" | "assistant"; content: string }>;
    loading: boolean;
    unavailable?: string;
    /**
     * Размер карточки. В сторе, а не в компоненте: вопрос из плана должен
     * разворачивать свёрнутого копилота сам.
     * collapsed — кнопка, normal — окно у угла, large — колонка вровень с планом.
     */
    size: CopilotSize;
    /** Ключ карточки, для которой сейчас спрашиваем ответ в заметку. */
    noteFor?: string;
  };
  /** Стартовый экран пройден: показываем рабочее пространство. */
  started: boolean;
  /**
   * Правая колонка с планом развёрнута. В сторе, а не в компоненте: от неё
   * зависит ширина карты (--panel-gap в page.tsx), а это соседний узел.
   */
  planOpen: boolean;
  /** Свои траты: такси, визы, страховки — Туту про них не знает. */
  extras: Extra[];
  /** Курсы ЦБ для пересчёта трат в рубли. */
  rates: Rates | null;
  ratesError?: string;
  /** Координаты городов, догруженные с сервера (справочник Natural Earth). */
  coords: Record<string, { lat: number; lng: number }>;

  addCity: (city: City, date: string, mode?: Mode) => void;
  removeLastCity: () => void;
  /** Сбрасывает начальную точку (доступно, пока нет ни одного плеча). */
  clearOrigin: () => void;
  setParty: (party: Party) => void;
  clear: () => void;
  chooseOffer: (legId: string, offer: OfferSnapshot) => void;
  chooseSeat: (legId: string, choice: { carNumber: string; seatNumbers: string[] }) => void;
  splitViaHub: (legId: string, hubName?: string) => void;
  /** Заменить город во всём маршруте: «Бали» → «Денпасар». */
  replaceCity: (oldName: string, newName: string) => void;
  findTransfer: (legId: string) => void;
  /** Фоновый подбор пересадки для плеча — без открытия модала. */
  prefetchTransfer: (legId: string) => Promise<void>;
  closeTransfer: () => void;
  applyTransfer: (option: TransferOption) => void;
  repair: () => void;
  chooseHotel: (key: string, hotel: HotelSnapshot) => void;
  /** Заметка карточки: leg id, stay key или ORIGIN_NOTE. null — удалить. */
  setNote: (target: string, note: Note | null) => void;
  hydrate: () => Promise<void>;
  runCheckout: () => Promise<void>;
  closeCheckout: () => void;
  runOptimizer: () => Promise<void>;
  closeOptimizer: () => void;
  applySuggestion: (s: OptimizeSuggestion) => void;
  askCopilot: (message: string, opts?: { noteFor?: string }) => Promise<void>;
  /** Оборвать текущую генерацию; возвращает снятую с отправки фразу. */
  stopCopilot: () => string | undefined;
  setCopilotSize: (size: CopilotSize) => void;
  setPlanOpen: (open: boolean) => void;
  syncCoords: () => void;
  seedLegend: () => void;
  /** Вход в рабочее пространство; непустой запрос уходит копилоту. */
  start: (query?: string) => void;
  /** Возврат на стартовый экран по клику на логотип. */
  goHome: () => void;
  loadRates: () => Promise<void>;
  addExtra: (input: { label: string; amount: number; currency: string; afterId: string }) => void;
  updateExtra: (id: string, input: { label: string; amount: number; currency: string }) => void;
  removeExtra: (id: string) => void;
  /** Скелет плана для ссылки: города, даты, состав, свои траты. */
  skeleton: () => Skeleton;
  /** Полный снимок для localStorage: с найденными офферами и заметками. */
  snapshotData: () => TripSnapshot;
  restore: (skeleton: Skeleton, snap?: TripSnapshot | null) => void;

  total: () => number;
  warnings: () => ConnectionWarning[];
}

/** Поля, которые переживают перезагрузку в localStorage. */
export interface TripSnapshot {
  legs: Leg[];
  stays: Stay[];
  origin: TripState["origin"];
  party: Party;
  extras: Extra[];
  coords: Record<string, { lat: number; lng: number }>;
}

/** Ключ заметки на карточке начальной точки (у неё нет id плеча). */
export const ORIGIN_NOTE = "origin";
/** Плечи, по которым уже идёт широкий пере-поиск ремонта (дедуп). */
const wideSearchInFlight = new Set<string>();
/** Города, по которым уже запрошены координаты (дедуп). */
const coordsInFlight = new Set<string>();

async function post<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

// Контроллер вне стейта: подписчикам стора он не нужен, а abort() не должен
// вызывать ре-рендеры.
let copilotAbort: AbortController | null = null;

export const useTrip = create<TripState>((set, get) => ({
  legs: [],
  stays: [],
  origin: null,
  party: DEFAULT_PARTY,
  legStatus: {},
  legOffers: {},
  legUnavailable: {},
  legResolved: {},
  stayStatus: {},
  stayHotels: {},
  transfer: { open: false },
  legTransfers: {},
  checkout: { open: false, loading: false },
  optimizer: { open: false, loading: false },
  copilot: { messages: [], loading: false, size: "normal" },
  started: false,
  planOpen: true,
  extras: [],
  rates: null,
  coords: {},

  addCity: (city, date, mode = "any") => {
    const { legs, stays, origin } = get();
    if (!origin) {
      set({ origin: { city, date } });
      get().syncCoords();
      return;
    }
    const from = legs.length ? legs[legs.length - 1].to : origin.city;
    const taken = new Set(legs.map((l) => l.id));
    const next: Leg = { id: legId(from, city, date, taken), from, to: city, date, mode };
    const newLegs = [...legs, next];
    set({ legs: newLegs, stays: deriveStays(newLegs, stays) });
    void get().hydrate();
  },

  clear: () => {
    set({
      legs: [],
      stays: [],
      origin: null,
      extras: [],
      legStatus: {},
      legOffers: {},
      legUnavailable: {},
      stayStatus: {},
      stayHotels: {},
    });
  },

  /**
   * Удаление последнего города маршрута: убирает последнее плечо целиком.
   * Точкой продолжения становится город, из которого это плечо уходило —
   * добавление следующего города продолжит цепочку оттуда.
   */
  removeLastCity: () => {
    const { legs } = get();
    if (legs.length === 0) return;
    const dropped = legs[legs.length - 1];
    const rest = legs.slice(0, -1);

    const drop = <T,>(map: Record<string, T>) => {
      const { [dropped.id]: _, ...keep } = map;
      return keep;
    };
    set((s) => ({
      legs: rest,
      // маршрут схлопнулся до одной точки — она и остаётся началом
      origin: rest.length === 0 ? { city: dropped.from, date: dropped.date } : s.origin,
      stays: deriveStays(rest, s.stays),
      legStatus: drop(s.legStatus),
      legOffers: drop(s.legOffers),
      legUnavailable: drop(s.legUnavailable),
    }));
  },

  /** Пока плеч нет, начальную точку можно просто снять и выбрать другую. */
  clearOrigin: () => {
    if (get().legs.length > 0) return;
    set({ origin: null });
  },

  /** Смена состава = другие цены везде: сброс офферов и полный пере-поиск. */
  setParty: (party) => {
    const legs = get().legs.map((l) => ({ ...l, selectedOffer: undefined, pinned: false }));
    const stays = get().stays.map((s) => ({ ...s, selectedHotel: undefined }));
    set({
      party,
      legs,
      stays,
      legStatus: {},
      legOffers: {},
      legUnavailable: {},
      stayStatus: {},
      stayHotels: {},
    });
    void get().hydrate();
  },

  /** Хаб-сплит: пустое плечо A→B заменяется на A→Москва и Москва→B. */
  splitViaHub: (id, hubName = "Москва") => {
    const { legs } = get();
    const ix = legs.findIndex((l) => l.id === id);
    if (ix < 0) return;
    const target = legs[ix];
    const hub: City = (CITIES.moscow.name === hubName ? CITIES.moscow : { name: hubName, lat: 0, lng: 0 }) as City;
    if (target.from.name === hubName || target.to.name === hubName) return;
    const taken = new Set(legs.map((l) => l.id));
    const a: Leg = { id: legId(target.from, hub, target.date, taken), from: target.from, to: hub, date: target.date, mode: "any" };
    taken.add(a.id);
    const b: Leg = { id: legId(hub, target.to, target.date, taken), from: hub, to: target.to, date: target.date, mode: "any" };
    const newLegs = [...legs.slice(0, ix), a, b, ...legs.slice(ix + 1)];
    set({
      legs: newLegs,
      stays: deriveStays(newLegs, get().stays),
      legStatus: {},
      legOffers: {},
      legUnavailable: {},
    });
    void get().hydrate();
  },

  /**
   * Замена города по всему маршруту. Нужна, когда Туту понял название не
   * так: «Бали» он ищет как город BLC в Камеруне, рейсов туда нет, и без
   * замены на «Денпасар» плечо не починить никак.
   */
  replaceCity: (oldName, newName) => {
    const key = slug(oldName);
    const next: CityRef = findCity(newName) ?? { name: newName, ...resolveCoords(newName) };
    const swap = (c: CityRef) => (slug(c.name) === key ? next : c);
    const legs = get().legs.map((l) => {
      const from = swap(l.from);
      const to = swap(l.to);
      if (from === l.from && to === l.to) return l;
      // город другой — прежние офферы к нему отношения не имеют
      return { ...l, from, to, selectedOffer: undefined, pinned: false };
    });
    const origin = get().origin;
    set({
      legs,
      origin: origin ? { ...origin, city: swap(origin.city) } : null,
      stays: deriveStays(legs, get().stays),
      legStatus: {},
      legOffers: {},
      legUnavailable: {},
      legResolved: {},
      stayStatus: {},
      stayHotels: {},
    });
    void get().hydrate();
  },

  /** Открыть модал пересадки; данные придут из legTransfers (или уже там). */
  findTransfer: (legId) => {
    set({ transfer: { open: true, legId } });
    void get().prefetchTransfer(legId);
  },

  /** Перебор хабов на сервере; после ошибки повторный вызов пробует снова. */
  prefetchTransfer: async (legId) => {
    const leg = get().legs.find((l) => l.id === legId);
    if (!leg) return;
    const cur = get().legTransfers[legId];
    if (cur && (cur.loading || cur.options)) return;
    set((s) => ({ legTransfers: { ...s.legTransfers, [legId]: { loading: true } } }));
    try {
      const r = await post<{ options: TransferOption[]; hubsTried: string[] }>("/api/transfer", {
        origin: leg.from.name,
        destination: leg.to.name,
        date: leg.date,
        party: get().party,
      });
      set((s) => ({
        legTransfers: {
          ...s.legTransfers,
          [legId]: { loading: false, options: r.options, hubsTried: r.hubsTried },
        },
      }));
    } catch (e) {
      set((s) => ({
        legTransfers: {
          ...s.legTransfers,
          [legId]: { loading: false, error: e instanceof Error ? e.message : String(e) },
        },
      }));
    }
  },

  closeTransfer: () => set((s) => ({ transfer: { ...s.transfer, open: false } })),

  /**
   * Применение варианта с пересадкой: плечо заменяется двумя, офферы
   * проставляются те самые, что человек увидел в списке (pinned — авто-ремонт
   * их не трогает).
   */
  applyTransfer: (opt) => {
    const legId_ = get().transfer.legId;
    const legs = get().legs;
    const ix = legs.findIndex((l) => l.id === legId_);
    if (ix < 0) return;
    const target = legs[ix];
    const hub: CityRef = findCity(opt.hub) ?? { name: opt.hub, ...resolveCoords(opt.hub) };
    const taken = new Set(legs.map((l) => l.id));
    const a: Leg = {
      id: legId(target.from, hub, target.date, taken),
      from: target.from,
      to: hub,
      date: target.date,
      mode: "any",
      selectedOffer: opt.first,
      pinned: true,
    };
    taken.add(a.id);
    const b: Leg = {
      id: legId(hub, target.to, opt.secondDate, taken),
      from: hub,
      to: target.to,
      date: opt.secondDate,
      mode: "any",
      selectedOffer: opt.second,
      pinned: true,
    };
    const newLegs = [...legs.slice(0, ix), a, b, ...legs.slice(ix + 1)];
    set((s) => ({
      legs: newLegs,
      stays: deriveStays(newLegs, s.stays),
      transfer: { open: false },
    }));
    void get().hydrate();
  },

  chooseOffer: (id, offer) => {
    // ручной выбор — pinned: авто-ремонт стыковок его не переопределяет
    const legs = get().legs.map((l) =>
      l.id === id ? { ...l, selectedOffer: offer, pinned: true } : l,
    );
    set({ legs, stays: deriveStays(legs, get().stays) });
    get().repair();
    void get().hydrate();
  },

  chooseHotel: (key, hotel) => {
    const stays = get().stays.map((s) => (stayKey(s) === key ? { ...s, selectedHotel: hotel } : s));
    set({ stays });
  },

  setNote: (target, note) => {
    const value = note ?? undefined;
    if (target === ORIGIN_NOTE) {
      set((s) => (s.origin ? { origin: { ...s.origin, note: value } } : {}));
      return;
    }
    set((s) => ({
      legs: s.legs.map((l) => (l.id === target ? { ...l, note: value } : l)),
      stays: s.stays.map((x) => (stayKey(x) === target ? { ...x, note: value } : x)),
    }));
  },

  chooseSeat: (id, choice) => {
    set((s) => ({
      legs: s.legs.map((l) => (l.id === id ? { ...l, seatChoice: choice } : l)),
    }));
  },

  /**
   * Догружает координаты городов маршрута и городов пересадок, которых нет
   * в справочнике приложения. Благодаря этому на карте появляются любые
   * города — из черновиков копилота, ручного ввода и пересадок рейсов.
   */
  syncCoords: () => {
    const { legs, origin, coords } = get();
    const wanted = new Set<string>();
    const need = (c: CityRef) => {
      if (c.lat === undefined && !coords[c.name] && !resolveCoords(c.name)) wanted.add(c.name);
    };
    if (origin) need(origin.city);
    for (const l of legs) {
      for (const c of [l.from, l.to]) {
        need(c);
      }
      const segs = l.selectedOffer?.segments ?? [];
      for (let i = 0; i < segs.length - 1; i++) {
        const name = cityOf(segs[i].to);
        if (!coords[name] && !resolveCoords(name)) wanted.add(name);
      }
    }
    const names = [...wanted].filter((n) => !coordsInFlight.has(n));
    if (names.length === 0) return;
    names.forEach((n) => coordsInFlight.add(n));
    void post<{ coords: Record<string, { lat: number; lng: number }> }>("/api/geo", { names })
      .then(({ coords: found }) => set((s) => ({ coords: { ...s.coords, ...found } })))
      .catch(() => {
        // не нашли — город останется вне карты, но в плане будет
      })
      .finally(() => names.forEach((n) => coordsInFlight.delete(n)));
  },

  /** Ядро UX: поиск — следствие сборки. Дозагружает всё недостающее. */
  hydrate: async () => {
    get().syncCoords();
    const state = get();

    for (const leg of state.legs) {
      if (leg.selectedOffer || (state.legStatus[leg.id] ?? "idle") !== "idle") continue;
      set((s) => ({ legStatus: { ...s.legStatus, [leg.id]: "loading" } }));
      void post<{
        offers: OfferSnapshot[];
        unavailable?: Array<{ mode: string; reason?: string; detail?: string }>;
        meta?: { from?: ResolvedGeo; to?: ResolvedGeo };
      }>("/api/search", {
        kind: "leg",
        origin: leg.from.name,
        destination: leg.to.name,
        date: leg.date,
        mode: leg.mode === "any" ? undefined : leg.mode,
        pageSize: 10,
        party: state.party,
      })
        .then(({ offers, unavailable, meta }) => {
          set((s) => {
            const legs = s.legs.map((l, ix) => {
              if (l.id !== leg.id || l.selectedOffer) return l;
              // выбор с учётом стыковки: если предыдущее плечо уже нашлось,
              // берём самый дешёвый оффер, на который УСПЕВАЕМ
              // план восстановлен из ссылки: там был закреплён конкретный рейс
              const wanted = l.wantOfferId
                ? offers.find((o) => o.offerId === l.wantOfferId)
                : undefined;
              if (wanted) {
                return { ...l, selectedOffer: wanted, pinned: true, wantOfferId: undefined };
              }
              const prev = ix > 0 ? s.legs[ix - 1].selectedOffer : undefined;
              const pick = prev ? (firstFeasible(offers, prev.arrivalAt) ?? offers[0]) : offers[0];
              return { ...l, selectedOffer: pick, wantOfferId: undefined };
            });
            return {
              legs,
              stays: deriveStays(legs, s.stays),
              legOffers: { ...s.legOffers, [leg.id]: offers },
              legUnavailable: { ...s.legUnavailable, [leg.id]: unavailable ?? [] },
              legResolved: { ...s.legResolved, [leg.id]: { from: meta?.from, to: meta?.to } },
              legStatus: { ...s.legStatus, [leg.id]: offers.length ? "ready" : "empty" },
            };
          });
          // умная система не ждёт клика: прямых нет — сами ищем пересадку,
          // карточка плеча покажет готовые варианты
          if (offers.length === 0) void get().prefetchTransfer(leg.id);
          get().repair();
          void get().hydrate();
        })
        .catch(() =>
          set((s) => ({ legStatus: { ...s.legStatus, [leg.id]: "error" } })),
        );
    }

    for (const stay of get().stays) {
      const key = stayKey(stay);
      if (stay.selectedHotel || (get().stayStatus[key] ?? "idle") !== "idle") continue;
      set((s) => ({ stayStatus: { ...s.stayStatus, [key]: "loading" } }));
      void post<{ hotels: HotelSnapshot[] }>("/api/search", {
        kind: "stay",
        city: stay.city.name,
        checkin: stay.checkin,
        checkout: stay.checkout,
        pageSize: 6,
        party: get().party,
      })
        .then(({ hotels }) => {
          set((s) => ({
            stays: s.stays.map((x) =>
              stayKey(x) === key && !x.selectedHotel ? { ...x, selectedHotel: hotels[0] } : x,
            ),
            stayHotels: { ...s.stayHotels, [key]: hotels },
            stayStatus: { ...s.stayStatus, [key]: hotels.length ? "ready" : "empty" },
          }));
        })
        .catch(() =>
          set((s) => ({ stayStatus: { ...s.stayStatus, [key]: "error" } })),
        );
    }
  },

  runCheckout: async () => {
    set({ checkout: { open: true, loading: true } });
    try {
      const { legs, stays, party, extras } = get();
      const result = await post<CheckoutResult>("/api/checkout", { legs, stays, party });
      // свои траты Туту не проверяет и не продаёт — добавляем их отдельной
      // строкой, без ссылки на оформление, но внутри итога
      const own: CheckoutItem[] = extras.map((e) => ({
        id: e.id,
        kind: "extra" as const,
        label: `${e.label} · ${e.amount} ${e.currency}${e.rub === undefined ? " (курса нет)" : ""}`,
        plannedPrice: e.rub ?? 0,
        freshPrice: e.rub ?? 0,
        diff: 0,
      }));
      const withExtras: CheckoutResult = {
        ...result,
        items: [...result.items, ...own],
        plannedTotal: result.plannedTotal + extrasTotal(extras),
        freshTotal: result.freshTotal + extrasTotal(extras),
      };
      set({ checkout: { open: true, loading: false, result: withExtras } });
    } catch (e) {
      set({
        checkout: {
          open: true,
          loading: false,
          result: {
            items: [],
            plannedTotal: 0,
            freshTotal: 0,
            diff: 0,
            failed: 1,
          },
        },
      });
      console.error(e);
    }
  },

  closeCheckout: () => set((s) => ({ checkout: { ...s.checkout, open: false } })),

  runOptimizer: async () => {
    set({ optimizer: { open: true, loading: true } });
    try {
      const { legs, party } = get();
      const result = await post<OptimizeResponse>("/api/optimize", { legs, party });
      set({ optimizer: { open: true, loading: false, result } });
    } catch (e) {
      set({
        optimizer: {
          open: true,
          loading: false,
          result: {
            current: null,
            suggestions: [],
            combinations: 0,
            uniqueSearches: 0,
            tookMs: 0,
            error: e instanceof Error ? e.message : String(e),
          },
        },
      });
    }
  },

  closeOptimizer: () => set((s) => ({ optimizer: { ...s.optimizer, open: false } })),

  /** Применение плана оптимизатора: новый порядок/даты, офферы ищутся заново. */
  applySuggestion: (sug) => {
    const byName = new Map<string, City>();
    // заметки переживают перестановку: ключ — пара городов, не id с датой
    const notes = new Map<string, Note>();
    for (const l of get().legs) {
      byName.set(l.from.name, l.from as City);
      byName.set(l.to.name, l.to as City);
      if (l.note) notes.set(`${l.from.name}→${l.to.name}`, l.note);
    }
    const taken = new Set<string>();
    const legs: Leg[] = sug.legs.map((pl) => {
      const from = byName.get(pl.from.name) ?? ({ name: pl.from.name } as City);
      const to = byName.get(pl.to.name) ?? ({ name: pl.to.name } as City);
      const id = legId(from, to, pl.date, taken);
      taken.add(id);
      return { id, from, to, date: pl.date, mode: pl.mode, note: notes.get(`${from.name}→${to.name}`) };
    });
    set({
      legs,
      origin: legs[0] ? { city: legs[0].from, date: legs[0].date } : null,
      stays: deriveStays(legs, get().stays),
      legStatus: {},
      legOffers: {},
      stayStatus: {},
      stayHotels: {},
      optimizer: { open: false, loading: false },
    });
    void get().hydrate();
  },

  /**
   * Авто-ремонт стыковок в две ступени. Чистая логика — в lib/repair.ts.
   * 1) pick: перевыбор из уже загруженного пула (10 дешёвых).
   * 2) shift от planRepairs интерпретируется мягко: сначала ШИРОКИЙ
   *    пере-поиск того же дня (pageSize 30) — дешёвая десятка могла не
   *    содержать вечерние рейсы; дата сдвигается, только если и в широком
   *    пуле нет выполнимого варианта.
   */
  repair: () => {
    const { legs, legOffers } = get();
    const actions = planRepairs(legs, legOffers);
    if (actions.length === 0) return;

    const picks = actions.filter((a) => a.kind === "pick");
    if (picks.length > 0) {
      const newLegs = get().legs.map((l) => {
        const a = picks.find((x) => x.legId === l.id);
        return a && a.kind === "pick" ? { ...l, selectedOffer: a.offer } : l;
      });
      set((s) => ({ legs: newLegs, stays: deriveStays(newLegs, s.stays) }));
    }

    const shift = actions.find((a) => a.kind === "shift");
    if (!shift || shift.kind !== "shift") return;
    if (wideSearchInFlight.has(shift.legId)) return;
    wideSearchInFlight.add(shift.legId);

    const leg = get().legs.find((l) => l.id === shift.legId);
    if (!leg) {
      wideSearchInFlight.delete(shift.legId);
      return;
    }
    void post<{ offers: OfferSnapshot[] }>("/api/search", {
      kind: "leg",
      origin: leg.from.name,
      destination: leg.to.name,
      date: leg.date,
      mode: leg.mode === "any" ? undefined : leg.mode,
      pageSize: 30,
      party: get().party,
    })
      .then(({ offers }) => {
        const s = get();
        const ix = s.legs.findIndex((l) => l.id === shift.legId);
        const prev = ix > 0 ? s.legs[ix - 1].selectedOffer : undefined;
        const fix = prev ? firstFeasible(offers, prev.arrivalAt) : undefined;
        if (fix) {
          const newLegs = s.legs.map((l) =>
            l.id === shift.legId ? { ...l, selectedOffer: fix } : l,
          );
          set((st) => ({
            legs: newLegs,
            stays: deriveStays(newLegs, st.stays),
            legOffers: { ...st.legOffers, [shift.legId]: offers },
          }));
          get().repair();
          return;
        }
        // и в широком пуле не успеваем — теперь честно сдвигаем дату
        const newLegs = s.legs.map((l) =>
          l.id === shift.legId
            ? { ...l, date: shift.newDate, autoShifts: (l.autoShifts ?? 0) + 1, selectedOffer: undefined }
            : l,
        );
        set((st) => ({
          legs: newLegs,
          stays: deriveStays(newLegs, st.stays),
          legStatus: { ...st.legStatus, [shift.legId]: "idle" },
        }));
        void get().hydrate();
      })
      .catch(() => {
        // широкий поиск упал — не блокируем: остаётся warning стыковки
      })
      .finally(() => {
        wideSearchInFlight.delete(shift.legId);
      });
  },

  /**
   * Копилот: черновик от LLM применяется тем же код-путём, что и ручная
   * сборка — legs без офферов, автопоиск наполняет (контракт из дока).
   */
  setCopilotSize: (size) => set((s) => ({ copilot: { ...s.copilot, size } })),

  setPlanOpen: (open) => set({ planOpen: open }),

  askCopilot: async (message, opts) => {
    const history = get().copilot.messages;
    set((s) => ({
      copilot: {
        ...s.copilot,
        messages: [...history, { role: "user", content: message }],
        loading: true,
        unavailable: undefined,
        noteFor: opts?.noteFor,
        // вопрос задан из плана — карточка должна быть на виду
        size: opts?.noteFor && s.copilot.size === "collapsed" ? "normal" : s.copilot.size,
      },
    }));
    copilotAbort = new AbortController();
    try {
      const { legs: curLegs, stays, party } = get();
      const r = await post<{
        reply: string;
        proposal?: {
          legs: Array<{ from: string; to: string; date: string; mode?: Mode }>;
          party?: Party;
        };
      }>(
        "/api/assist",
        { message, trip: { legs: curLegs, stays }, history, party },
        copilotAbort.signal,
      );
      set((s) => ({
        copilot: {
          ...s.copilot,
          messages: [...s.copilot.messages, { role: "assistant", content: r.reply }],
          loading: false,
          noteFor: undefined,
        },
      }));
      // ответ на вопрос от карточки сразу ложится в её заметку
      if (opts?.noteFor && !r.proposal) {
        get().setNote(opts.noteFor, { text: r.reply, source: "ai" });
      }
      if (r.proposal) {
        const taken = new Set<string>();
        const legs: Leg[] = r.proposal.legs.map((pl) => {
          const from = findCity(pl.from) ?? { name: pl.from, ...resolveCoords(pl.from) };
          const to = findCity(pl.to) ?? { name: pl.to, ...resolveCoords(pl.to) };
          const id = legId(from, to, pl.date, taken);
          taken.add(id);
          return { id, from, to, date: pl.date, mode: pl.mode ?? "any" };
        });
        set({
          legs,
          origin: legs[0] ? { city: legs[0].from, date: legs[0].date } : null,
          // состав из запроса («вдвоём», «с ребёнком 5 лет») меняет цены всех
          // поисков, поэтому ставим его до hydrate, а не после
          ...(r.proposal.party ? { party: r.proposal.party } : {}),
          stays: deriveStays(legs, get().stays),
          legStatus: {},
          legOffers: {},
          stayStatus: {},
          stayHotels: {},
        });
        void get().hydrate();
      }
    } catch (e) {
      // остановка пользователем — не ошибка: stopCopilot уже прибрал состояние
      if (e instanceof DOMException && e.name === "AbortError") return;
      set((s) => ({
        copilot: {
          ...s.copilot,
          loading: false,
          noteFor: undefined,
          unavailable: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  },

  stopCopilot: () => {
    const cop = get().copilot;
    if (!cop.loading) return undefined;
    copilotAbort?.abort();
    // снимаем оптимистично добавленную фразу — она вернётся в поле черновиком
    const messages = [...cop.messages];
    const last = messages[messages.length - 1];
    let draft: string | undefined;
    if (last?.role === "user") {
      draft = last.content;
      messages.pop();
    }
    set((s) => ({
      copilot: { ...s.copilot, messages, loading: false, noteFor: undefined },
    }));
    return draft;
  },

  /** Демо-легенда из дизайн-дока: Оскол → Стамбул → Иберия → Оскол. */
  seedLegend: () => {
    get().clear();
    const add = get().addCity;
    const c = LEGEND;
    add(c[0].city, c[0].date);
    for (let i = 1; i < c.length; i++) add(c[i].city, c[i].date, c[i].mode);
  },

  start: (query) => {
    set({ started: true });
    const q = query?.trim();
    if (q) void get().askCopilot(q);
  },

  /*
   * План при этом остаётся в сторе: логотип на сайте ведёт домой, а не
   * стирает работу. Вернуться к собранному маршруту можно ссылкой
   * «или собрать маршрут вручную» — она заходит в то же состояние.
   */
  goHome: () => set({ started: false }),

  /** Курсы тянем один раз на сессию: ЦБ обновляет их раз в сутки. */
  loadRates: async () => {
    if (get().rates) return;
    try {
      const res = await fetch("/api/rates");
      const data = (await res.json()) as Rates & { error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      set({ rates: data, ratesError: undefined });
    } catch (e) {
      // без курсов трату всё равно можно записать — просто в своей валюте
      set({ ratesError: e instanceof Error ? e.message : String(e) });
    }
  },

  addExtra: (input) => {
    const taken = new Set(get().extras.map((e) => e.id));
    const converted = toRub(input.amount, input.currency, get().rates);
    set((s) => ({ extras: [...s.extras, makeExtra(input, converted, taken)] }));
  },

  /** Правка траты: сумма и валюта могли смениться — курс берём заново. */
  updateExtra: (id, input) => {
    const converted = toRub(input.amount, input.currency, get().rates);
    set((s) => ({
      extras: s.extras.map((e) =>
        e.id === id
          ? {
              ...e,
              label: input.label.trim() || e.label,
              amount: input.amount,
              currency: input.currency.toUpperCase(),
              rub: converted?.rub,
              rate: converted?.rate,
              rateDate: converted?.rateDate,
            }
          : e,
      ),
    }));
  },

  removeExtra: (id) => set((s) => ({ extras: s.extras.filter((e) => e.id !== id) })),

  skeleton: () => {
    const { legs, origin, party, extras } = get();
    return {
      v: STATE_VERSION,
      party: { a: party.adults, c: party.childrenAges },
      ...(origin ? { origin: { n: origin.city.name, d: origin.date } } : {}),
      legs: legs.map((l) => ({
        f: l.from.name,
        t: l.to.name,
        d: l.date,
        m: l.mode,
        // в ссылку кладём только ручной выбор: автоподбор повторится сам
        ...(l.pinned && l.selectedOffer ? { o: l.selectedOffer.offerId } : {}),
      })),
      ...(extras.length ? { extras } : {}),
    };
  },

  snapshotData: () => {
    const { legs, stays, origin, party, extras, coords } = get();
    return { legs, stays, origin, party, extras, coords };
  },

  /**
   * Восстановление плана. Снимок — быстрый путь: цены и заметки уже есть.
   * Без него собираем маршрут из скелета ссылки и запускаем поиск заново:
   * серверный кэш делает это дешёвым, а закреплённые рейсы найдутся по id.
   */
  restore: (sk, snap) => {
    if (snap && snap.legs?.length) {
      set({
        started: true,
        legs: snap.legs,
        stays: snap.stays ?? [],
        origin: snap.origin ?? null,
        party: snap.party ?? DEFAULT_PARTY,
        extras: snap.extras ?? [],
        coords: snap.coords ?? {},
      });
      void get().hydrate();
      return;
    }

    const taken = new Set<string>();
    const city = (name: string): CityRef => findCity(name) ?? { name, ...resolveCoords(name) };
    const legs: Leg[] = sk.legs.map((l) => {
      const from = city(l.f);
      const to = city(l.t);
      const id = legId(from, to, l.d, taken);
      taken.add(id);
      return { id, from, to, date: l.d, mode: l.m, wantOfferId: l.o };
    });
    set({
      started: true,
      legs,
      stays: deriveStays(legs, []),
      origin: sk.origin
        ? { city: city(sk.origin.n), date: sk.origin.d }
        : legs[0]
          ? { city: legs[0].from, date: legs[0].date }
          : null,
      party: partyOf(sk),
      extras: sk.extras ?? [],
      legStatus: {},
      legOffers: {},
      stayStatus: {},
      stayHotels: {},
    });
    void get().hydrate();
  },

  total: () =>
    tripTotal({ legs: get().legs, stays: get().stays }) + extrasTotal(get().extras),
  warnings: () => connectionWarnings(get().legs),
}));


/**
 * Демо-легенда лежит в lib/legend.json: тот же файл читает scripts/warm.mjs,
 * который греет кэш перед показом. Разъехаться они не могут.
 */
const LEGEND: Array<{ city: City; date: string; mode?: Mode }> = legendData.stops.map((s) => ({
  city: (findCity(s.name) ?? CITIES.moscow) as City,
  date: s.date,
  mode: s.mode as Mode | undefined,
}));
