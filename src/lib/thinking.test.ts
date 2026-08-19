import { describe, expect, it } from "vitest";
import { drawPhrase, FIRST_PHRASE, THINKING_PHRASES } from "./thinking";

/** Прогоняет n выдач подряд так, как это делает индикатор. */
function run(n: number, rnd: (i: number) => number) {
  let bag: string[] = [];
  let phrase = FIRST_PHRASE;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = drawPhrase(bag, phrase, rnd(i));
    bag = d.bag;
    phrase = d.phrase;
    out.push(phrase);
  }
  return out;
}

describe("drawPhrase", () => {
  it("за круг показывает каждую фразу ровно один раз", () => {
    const круг = run(THINKING_PHRASES.length, (i) => (i * 7919) % 1000 / 1000);
    expect(круг.length).toBe(THINKING_PHRASES.length);
    expect(new Set(круг).size).toBe(THINKING_PHRASES.length);
    expect([...круг].sort()).toEqual([...THINKING_PHRASES].sort());
  });

  it("после опустевшего мешка набирает новый круг, снова без повторов внутри", () => {
    const два = run(THINKING_PHRASES.length * 2, (i) => (i * 104729) % 997 / 997);
    const первый = два.slice(0, THINKING_PHRASES.length);
    const второй = два.slice(THINKING_PHRASES.length);
    expect(new Set(первый).size).toBe(THINKING_PHRASES.length);
    expect(new Set(второй).size).toBe(THINKING_PHRASES.length);
  });

  it("никогда не повторяет фразу подряд, в том числе на стыке кругов", () => {
    // сетка случайных значений: границы стыка попадают под перебор
    for (let seed = 0; seed < 40; seed++) {
      const ряд = run(THINKING_PHRASES.length * 3, (i) => ((i + seed) * 31 % 100) / 100);
      for (let i = 1; i < ряд.length; i++) expect(ряд[i]).not.toBe(ряд[i - 1]);
      expect(ряд[0]).not.toBe(FIRST_PHRASE);
    }
  });

  it("на границах диапазона не выходит за пределы списка", () => {
    expect(THINKING_PHRASES).toContain(drawPhrase([], undefined, 0).phrase);
    // Math.random() не отдаёт 1, но и на ней не должно быть undefined
    expect(THINKING_PHRASES).toContain(drawPhrase([], undefined, 1).phrase);
    expect(THINKING_PHRASES).toContain(drawPhrase([], undefined, 0.999999).phrase);
  });

  it("возвращает мешок без выданной фразы", () => {
    const d = drawPhrase([], undefined, 0.5);
    expect(d.bag).not.toContain(d.phrase);
    expect(d.bag.length).toBe(THINKING_PHRASES.length - 1);
  });

  it("исключённая на стыке фраза остаётся в мешке и выпадет позже", () => {
    const prev = THINKING_PHRASES[3];
    const d = drawPhrase([], prev, 0.5);
    expect(d.phrase).not.toBe(prev);
    expect(d.bag).toContain(prev);
  });

  it("из мешка с одной фразой отдаёт её, даже если она же на экране", () => {
    // иначе выдача была бы пустой: круг обязан дойти до конца
    const last = THINKING_PHRASES[0];
    expect(drawPhrase([last], last, 0.5).phrase).toBe(last);
  });

  it("«Думаю...» не попадает в случайный набор — она только открывающая", () => {
    expect(THINKING_PHRASES).not.toContain(FIRST_PHRASE);
  });

  it("все фразы заканчиваются многоточием", () => {
    for (const p of [FIRST_PHRASE, ...THINKING_PHRASES]) expect(p.endsWith("...")).toBe(true);
  });
});
