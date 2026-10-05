import { describe, expect, it } from "vitest";

import { knownCityId } from "../src/results/acquisition";

describe("knownCityId", () => {
  it("maps every domestic track to its TJK SehirId", () => {
    expect(knownCityId("Adana")).toBe("1");
    expect(knownCityId("İzmir")).toBe("2");
    expect(knownCityId("İstanbul")).toBe("3");
    expect(knownCityId("Bursa")).toBe("4");
    expect(knownCityId("Ankara")).toBe("5");
    expect(knownCityId("Şanlıurfa")).toBe("6");
    expect(knownCityId(" Elazığ ")).toBe("7");
    expect(knownCityId("Diyarbakır")).toBe("8");
    expect(knownCityId("Kocaeli")).toBe("9");
  });

  it("leaves unknown cities to discovery", () => {
    expect(knownCityId("Deauville")).toBeNull();
  });
});
