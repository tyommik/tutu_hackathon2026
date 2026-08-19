/**
 * In-memory кэш с TTL. Один Node-процесс (pm2 fork, instances: 1) — см.
 * дизайн-док. Демо-режим: TROPA_CACHE_TTL_MS=86400000 (24 ч) + прогрев.
 */
const DEFAULT_TTL_MS = Number(process.env.TROPA_CACHE_TTL_MS ?? 10 * 60 * 1000);

interface Entry {
  value: unknown;
  expiresAt: number;
}

const store = new Map<string, Entry>();

export function cacheKey(tool: string, args: Record<string, unknown>): string {
  return `${tool}:${JSON.stringify(args, Object.keys(args).sort())}`;
}

export function cacheGet<T>(key: string): T | undefined {
  const e = store.get(key);
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return undefined;
  }
  return e.value as T;
}

export function cacheSet(key: string, value: unknown, ttlMs = DEFAULT_TTL_MS): void {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export async function cached<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs = DEFAULT_TTL_MS,
): Promise<{ value: T; hit: boolean }> {
  const existing = cacheGet<T>(key);
  if (existing !== undefined) return { value: existing, hit: true };
  const value = await fn();
  cacheSet(key, value, ttlMs);
  return { value, hit: false };
}

export function cacheStats() {
  return { entries: store.size };
}
