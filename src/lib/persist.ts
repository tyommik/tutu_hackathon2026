/**
 * Сохранение плана между перезагрузками.
 *
 * Два слоя, потому что у них разные задачи:
 *
 * 1. Скелет в #-фрагменте URL — города, даты, режимы, состав, свои траты и
 *    id закреплённых вручную офферов. Фрагмент не уходит на сервер, ссылку
 *    можно переслать: на той стороне поиск повторится (серверный кэш делает
 *    это быстрым) и соберёт тот же план.
 * 2. Полный снимок в localStorage под хешем скелета — найденные офферы,
 *    отели и заметки. Они весят килобайты и в URL им не место, но именно
 *    они делают F5 мгновенным и не теряют текст заметок.
 */

import type { Extra } from "./extras";
import type { Mode, Party } from "./trip";

export const STATE_VERSION = 2;
/** Снимок старше суток не восстанавливаем: цены за это время протухают. */
export const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
/** Сколько планов держим в localStorage. */
const SNAPSHOT_KEEP = 5;
const SNAPSHOT_PREFIX = "tropa:snap:";

export interface SkeletonLeg {
  f: string;
  t: string;
  d: string;
  m: Mode;
  /** id оффера, выбранного вручную: восстановим ровно его. */
  o?: string;
}

export interface Skeleton {
  v: number;
  party: { a: number; c: number[] };
  origin?: { n: string; d: string };
  legs: SkeletonLeg[];
  extras?: Extra[];
}

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeSkeleton(s: Skeleton): string {
  return toBase64Url(JSON.stringify(s));
}

/** Разбор скелета из URL. Любой мусор — это просто «плана нет». */
export function decodeSkeleton(raw: string): Skeleton | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(raw)) as Skeleton;
    if (parsed?.v !== STATE_VERSION || !Array.isArray(parsed.legs)) return null;
    if (!parsed.party || typeof parsed.party.a !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Ключ снимка: одинаковый скелет — одинаковый ключ, без хранения самой строки. */
export function planKey(encoded: string): string {
  let h = 2166136261;
  for (let i = 0; i < encoded.length; i++) {
    h ^= encoded.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export interface Snapshot<T> {
  v: number;
  at: number;
  data: T;
}

export function saveSnapshot<T>(key: string, data: T, now = Date.now()): void {
  try {
    const payload: Snapshot<T> = { v: STATE_VERSION, at: now, data };
    localStorage.setItem(SNAPSHOT_PREFIX + key, JSON.stringify(payload));
    pruneSnapshots(now);
  } catch {
    // приватный режим или переполнение — план просто не переживёт F5
  }
}

export function loadSnapshot<T>(key: string, now = Date.now()): T | null {
  try {
    const raw = localStorage.getItem(SNAPSHOT_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot<T>;
    if (parsed.v !== STATE_VERSION || now - parsed.at > SNAPSHOT_TTL_MS) {
      localStorage.removeItem(SNAPSHOT_PREFIX + key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** Держим только свежие планы: старые чистим по времени и по количеству. */
export function pruneSnapshots(now = Date.now()): void {
  try {
    const mine: Array<{ key: string; at: number }> = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(SNAPSHOT_PREFIX)) continue;
      try {
        const { at, v } = JSON.parse(localStorage.getItem(key) ?? "{}") as Snapshot<unknown>;
        if (v !== STATE_VERSION || now - at > SNAPSHOT_TTL_MS) {
          mine.push({ key, at: -1 });
        } else {
          mine.push({ key, at });
        }
      } catch {
        mine.push({ key, at: -1 });
      }
    }
    mine
      .sort((a, b) => b.at - a.at)
      .slice(SNAPSHOT_KEEP)
      .concat(mine.filter((m) => m.at === -1))
      .forEach((m) => localStorage.removeItem(m.key));
  } catch {
    // localStorage недоступен — чистить нечего
  }
}

/** Скелет из URL текущей страницы. */
export function skeletonFromLocation(hash: string): { raw: string; skeleton: Skeleton | null } {
  const raw = hash.startsWith("#p=") ? hash.slice(3) : "";
  return { raw, skeleton: decodeSkeleton(raw) };
}

export function partyOf(s: Skeleton): Party {
  return { adults: s.party.a, childrenAges: s.party.c ?? [] };
}
