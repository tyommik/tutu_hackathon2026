import { describe, expect, it } from "vitest";
import { currencyOptions, parseCbrXml, snapshotRates, toRub } from "./rates";

// Фрагмент живого ответа cbr.ru/scripts/XML_daily.asp (18.08.2026)
const XML = `<?xml version="1.0" encoding="windows-1251"?><ValCurs Date="18.08.2026" name="Foreign Currency Market">
<Valute ID="R01010"><NumCode>036</NumCode><CharCode>AUD</CharCode><Nominal>1</Nominal><Name>Австралийский доллар</Name><Value>60,4787</Value><VunitRate>60,4787</VunitRate></Valute>
<Valute ID="R01239"><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Евро</Name><Value>93,2500</Value><VunitRate>93,25</VunitRate></Valute>
<Valute ID="R01820"><NumCode>392</NumCode><CharCode>JPY</CharCode><Nominal>100</Nominal><Name>Иен</Name><Value>54,1000</Value><VunitRate>0,541</VunitRate></Valute>
<Valute ID="R01700J"><NumCode>949</NumCode><CharCode>TRY</CharCode><Nominal>10</Nominal><Name>Турецких лир</Name><Value>19,5000</Value><VunitRate>1,95</VunitRate></Valute>
</ValCurs>`;

describe("parseCbrXml", () => {
  const r = parseCbrXml(XML);

  it("дата приводится к ISO", () => {
    expect(r.date).toBe("2026-08-18");
  });

  it("курс — за одну единицу: номинал делится", () => {
    expect(r.rates.EUR).toBeCloseTo(93.25, 4);
    // иена котируется за 100 — иначе бюджет ошибётся стократно
    expect(r.rates.JPY).toBeCloseTo(0.541, 6);
    expect(r.rates.TRY).toBeCloseTo(1.95, 6);
  });

  it("рубль всегда единица", () => {
    expect(r.rates.RUB).toBe(1);
  });

  it("мусор не роняет разбор", () => {
    const broken = parseCbrXml(`<ValCurs Date="18.08.2026"><Valute><CharCode>XXX</CharCode><Value>—</Value></Valute></ValCurs>`);
    expect(broken.rates.XXX).toBeUndefined();
    expect(broken.rates.RUB).toBe(1);
  });
});

describe("toRub", () => {
  const rates = parseCbrXml(XML);

  it("40 евро по курсу ЦБ", () => {
    const c = toRub(40, "EUR", rates)!;
    expect(c.rub).toBeCloseTo(3730, 2);
    expect(c.rate).toBeCloseTo(93.25, 4);
    expect(c.rateDate).toBe("2026-08-18");
  });

  it("рубли не конвертирует и работает без курсов", () => {
    expect(toRub(500, "RUB", null)).toMatchObject({ rub: 500, rate: 1 });
  });

  it("регистр кода не важен", () => {
    expect(toRub(1, "eur", rates)!.rub).toBeCloseTo(93.25, 2);
  });

  it("неизвестная валюта — null, а не выдуманный курс", () => {
    expect(toRub(10, "ZZZ", rates)).toBeNull();
    expect(toRub(10, "EUR", null)).toBeNull();
    expect(toRub(Number.NaN, "EUR", rates)).toBeNull();
  });
});

describe("currencyOptions", () => {
  it("популярные впереди, остальные по алфавиту", () => {
    const opts = currencyOptions(parseCbrXml(XML));
    expect(opts[0]).toBe("RUB");
    expect(opts.indexOf("EUR")).toBeLessThan(opts.indexOf("AUD"));
    expect(opts).toContain("AUD");
  });

  it("без курсов остаётся хотя бы популярный список", () => {
    expect(currencyOptions(null)).toContain("EUR");
  });
});

describe("snapshotRates", () => {
  const r = snapshotRates();

  it("снимок разбирается и даёт осмысленный набор валют", () => {
    expect(Object.keys(r.rates).length).toBeGreaterThan(30);
    expect(r.rates.RUB).toBe(1);
  });

  it("популярные валюты на месте — иначе пересчёт трат молча сломается", () => {
    for (const c of ["USD", "EUR", "TRY", "AED", "KZT", "CNY"]) {
      expect(r.rates[c]).toBeGreaterThan(0);
    }
  });

  it("номинал учтён: иена стоит рубли, а не сотни рублей", () => {
    // JPY котируется за 100 единиц; без деления на номинал курс был бы ~×100
    expect(r.rates.JPY).toBeGreaterThan(0.1);
    expect(r.rates.JPY).toBeLessThan(5);
  });

  it("источник помечен как снимок с датой — на экране видно, что курс не живой", () => {
    expect(r.source).toMatch(/снимок от \d{2}\.\d{2}\.\d{4}/);
  });

  it("дата снимка заполнена", () => {
    expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
