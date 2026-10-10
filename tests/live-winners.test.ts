import { describe, expect, it } from "vitest";

import { winnersFromResults } from "../src/results/live-winners";

describe("live winners", () => {
  it("takes the single winner of each posted race and skips dead heats", () => {
    const winners = winnersFromResults({
      city: "Bursa",
      raceDate: "2026-10-05",
      races: [
        { raceNumber: 1, runners: [
          { horseNumber: 3, horseName: "A", finishPosition: 2 },
          { horseNumber: 5, horseName: "B", finishPosition: 1 }
        ] },
        { raceNumber: 2, runners: [
          { horseNumber: 1, horseName: "C", finishPosition: 1 },
          { horseNumber: 2, horseName: "D", finishPosition: 1 }
        ] }
      ]
    });

    expect([...winners]).toEqual([[1, 5]]);
  });
});
