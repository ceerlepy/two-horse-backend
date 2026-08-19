import {
  describe,
  expect,
  it
} from "vitest";

import {
  horseKeyFromProfileUrl
} from "../src/form/horse-key";

import {
  validateHorseHistory
} from "../src/form/history-validator";

describe(
  "form production foundation",
  () => {
    it(
      "extracts stable TJK horse id",
      () => {
        expect(
          horseKeyFromProfileUrl(
            "https://www.tjk.org/TR/Kurumsal/Query/ConnectedPage/AtKosuBilgileri?QueryParameter_AtId=99665"
          )
        ).toBe(
          "tjk:99665"
        );
      }
    );

    it(
      "rejects empty form history",
      () => {
        expect(
          () =>
            validateHorseHistory(
              []
            )
        ).toThrow(
          "FORM_NO_ROWS"
        );
      }
    );

    it(
      "accepts usable form history",
      () => {
        expect(
          () =>
            validateHorseHistory([
              {
                raceDate:
                  "2026-08-01",
                city:
                  "İzmir",
                distanceMeters:
                  1400,
                track:
                  "Kum",
                finishPosition:
                  2,
                weight:
                  58,
                jockey:
                  "TEST",
                odds:
                  3.2,
                hp:
                  88
              }
            ])
        ).not.toThrow();
      }
    );
  }
);
