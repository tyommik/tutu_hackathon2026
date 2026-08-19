import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  decodeSkeleton,
  encodeSkeleton,
  loadSnapshot,
  partyOf,
  planKey,
  pruneSnapshots,
  saveSnapshot,
  skeletonFromLocation,
  SNAPSHOT_TTL_MS,
  STATE_VERSION,
  type Skeleton,
} from "./persist";

/** Минимальный localStorage: тесты гоняем в node, без jsdom. */
class MemoryStorage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  key(i: number) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, String(v));
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}

beforeAll(() => {
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), writable: true });
});

const skeleton: Skeleton = {
  v: STATE_VERSION,
  party: { a: 2, c: [5] },
  origin: { n: "Старый Оскол", d: "2026-09-10" },
  legs: [
    { f: "Старый Оскол", t: "Москва", d: "2026-09-10", m: "rail" },
    { f: "Москва", t: "Стамбул", d: "2026-09-11", m: "any", o: "9205e5ac5ddfbf8e85172444bac28c4e" },
  ],
  extras: [{ id: "extra-1", label: "Такси", amount: 40, currency: "EUR", rub: 3933, afterId: "origin" }],
};

describe("кодирование скелета", () => {
  it("переживает круг: кириллица, состав, закреплённый оффер", () => {
    const back = decodeSkeleton(encodeSkeleton(skeleton))!;
    expect(back).toEqual(skeleton);
    expect(back.legs[1].o).toBe("9205e5ac5ddfbf8e85172444bac28c4e");
    expect(partyOf(back)).toEqual({ adults: 2, childrenAges: [5] });
  });

  it("строка URL-безопасная: без +, / и =", () => {
    expect(encodeSkeleton(skeleton)).not.toMatch(/[+/=]/);
  });

  it("демо-легенда влезает в разумную ссылку", () => {
    const legs = Array.from({ length: 9 }, (_, i) => ({
      f: "Старый Оскол",
      t: "Барселона",
      d: `2026-09-1${i % 10}`,
      m: "any" as const,
    }));
    expect(encodeSkeleton({ ...skeleton, legs }).length).toBeLessThan(1500);
  });

  it("мусор и чужая версия — это «плана нет», а не падение", () => {
    expect(decodeSkeleton("")).toBeNull();
    expect(decodeSkeleton("не-base64!!")).toBeNull();
    expect(decodeSkeleton(encodeSkeleton({ ...skeleton, v: 999 }))).toBeNull();
    expect(decodeSkeleton(btoa("{}"))).toBeNull();
  });
});

describe("skeletonFromLocation", () => {
  it("читает только свой параметр", () => {
    const raw = encodeSkeleton(skeleton);
    expect(skeletonFromLocation(`#p=${raw}`).skeleton).toEqual(skeleton);
    expect(skeletonFromLocation("#что-то-другое").skeleton).toBeNull();
    expect(skeletonFromLocation("").skeleton).toBeNull();
  });
});

describe("planKey", () => {
  it("одинаковый скелет — одинаковый ключ, разный — разный", () => {
    const a = encodeSkeleton(skeleton);
    const b = encodeSkeleton({ ...skeleton, party: { a: 1, c: [] } });
    expect(planKey(a)).toBe(planKey(a));
    expect(planKey(a)).not.toBe(planKey(b));
  });
});

describe("снимок в localStorage", () => {
  beforeEach(() => localStorage.clear());

  it("сохраняется и читается", () => {
    saveSnapshot("k1", { legs: [1, 2, 3] });
    expect(loadSnapshot<{ legs: number[] }>("k1")).toEqual({ legs: [1, 2, 3] });
  });

  it("вчерашний снимок не восстанавливаем: цены протухли", () => {
    const t0 = 1_000_000_000_000;
    saveSnapshot("k1", { a: 1 }, t0);
    expect(loadSnapshot("k1", t0 + SNAPSHOT_TTL_MS + 1)).toBeNull();
    expect(localStorage.getItem("tropa:snap:k1")).toBeNull();
  });

  it("битый снимок не роняет восстановление", () => {
    localStorage.setItem("tropa:snap:k2", "{не json");
    expect(loadSnapshot("k2")).toBeNull();
  });

  it("храним только последние пять планов", () => {
    const t0 = 1_000_000_000_000;
    for (let i = 0; i < 8; i++) saveSnapshot(`k${i}`, { i }, t0 + i);
    pruneSnapshots(t0 + 100);
    const left: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("tropa:snap:")) left.push(k);
    }
    expect(left).toHaveLength(5);
    // выживают самые свежие
    expect(left).toContain("tropa:snap:k7");
    expect(left).not.toContain("tropa:snap:k0");
  });
});
