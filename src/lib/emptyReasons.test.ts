import { describe, expect, it } from "vitest";
import { explainEmptyLeg } from "./emptyReasons";

const TODAY = new Date("2026-08-17T12:00:00");

describe("explainEmptyLeg", () => {
  it("город без аэропорта → причина + предложение хаб-сплита", () => {
    const r = explainEmptyLeg(
      [
        { mode: "avia", reason: "no_route", detail: "avia requires avia_id for origin, but…" },
        { mode: "railway", reason: "no_route", detail: "railway requires railway_id for origin…" },
      ],
      "2026-09-20",
      TODAY,
    );
    expect(r.hubSplit).toBe(true);
    expect(r.reasons.join(" ")).toContain("нет аэропорта");
    expect(r.reasons.join(" ")).toContain("ж/д за пределами России");
    expect(r.horizon).toBe(false);
  });

  it("дата за горизонтом продаж → объяснение про открытие продаж", () => {
    const r = explainEmptyLeg([], "2026-11-20", TODAY);
    expect(r.horizon).toBe(true);
    expect(r.reasons.join(" ")).toContain("продажи");
    expect(r.hubSplit).toBe(false);
  });

  it("без данных — честный дефолт", () => {
    const r = explainEmptyLeg([], "2026-09-01", TODAY);
    expect(r.reasons).toEqual(["Туту ничего не нашёл на эту дату"]);
  });
});
