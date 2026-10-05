import { describe, expect, it } from "vitest";

import { ownsArticle } from "../src/experts/adapters/horseturk";

describe("HorseTurk article ownership", () => {
  it("accepts all three live title patterns", () => {
    expect(ownsArticle("https://www.horseturk.com/at-yarisi-tahminleri-ankara-3-ekim-2026/")).toBe(true);
    expect(ownsArticle("https://www.horseturk.com/altili-ganyan-tahmin-izmir-3-ekim-2026/")).toBe(true);
    expect(ownsArticle("https://www.horseturk.com/at-yarislari-tahmin-diyarbakir-3-ekim-2026/")).toBe(true);
  });

  it("rejects category pages and other hosts", () => {
    expect(ownsArticle("https://www.horseturk.com/cat/at-yarisi-tahminleri/")).toBe(false);
    expect(ownsArticle("https://example.com/at-yarislari-tahmin-bursa-5-ekim-2026/")).toBe(false);
  });
});
