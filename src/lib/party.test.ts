import { describe, expect, it } from "vitest";
import { paxArgs } from "./search";
import { partyLabel } from "./trip";

const FAMILY = { adults: 2, childrenAges: [1, 7, 14] };

describe("paxArgs", () => {
  it("авиа: подросток 14 лет — взрослый, 7 лет — ребёнок, 1 год — младенец", () => {
    expect(paxArgs("search_avia", FAMILY)).toEqual({ adults: 3, children: 1, infants: 1 });
  });

  it("автобус: все до 12 — children, подростки — взрослые", () => {
    expect(paxArgs("search_bus", FAMILY)).toEqual({ adults: 3, children: 2 });
  });

  it("ж/д и мультипоиск — только взрослые (ограничение MCP)", () => {
    expect(paxArgs("search_rail", FAMILY)).toEqual({ passengers: 3 });
    expect(paxArgs("search_multitransport", FAMILY)).toEqual({ adults: 3 });
  });

  it("отели: взрослые как есть + возрасты всех детей", () => {
    expect(paxArgs("search_hotels", FAMILY)).toEqual({ adults: 2, children_ages: [1, 7, 14] });
  });

  it("один взрослый без детей", () => {
    expect(paxArgs("search_avia", { adults: 1, childrenAges: [] })).toEqual({
      adults: 1,
      children: 0,
      infants: 0,
    });
  });
});

describe("partyLabel", () => {
  it("склоняется по-человечески", () => {
    expect(partyLabel({ adults: 1, childrenAges: [] })).toBe("1 взрослый");
    expect(partyLabel({ adults: 2, childrenAges: [7] })).toBe("2 взрослых · ребёнок 7 лет");
    expect(partyLabel({ adults: 2, childrenAges: [3, 9] })).toBe("2 взрослых · дети: 3, 9 лет");
  });
});
