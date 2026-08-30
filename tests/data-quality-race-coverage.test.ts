import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildRaceFieldCoverage,
  classifyRaceFieldCoverage
} from "../src/api/diagnostics/data-quality";


describe(
  "race field coverage classification (Part 7/8)",
  () => {
    it(
      "reports full coverage when nothing is missing",
      () => {
        expect(
          classifyRaceFieldCoverage(
            10,
            0
          )
        )
          .toBe("full-coverage");
      }
    );


    it(
      "treats a whole-race gap as likely-not-published, not a bug",
      () => {
        expect(
          classifyRaceFieldCoverage(
            11,
            11
          )
        )
          .toBe("likely-not-published");
      }
    );


    it(
      "flags a scattered subset as a partial gap needing investigation",
      () => {
        expect(
          classifyRaceFieldCoverage(
            10,
            3
          )
        )
          .toBe("partial-gap");
      }
    );


    it(
      "treats zero runners as full coverage rather than dividing by zero",
      () => {
        expect(
          classifyRaceFieldCoverage(
            0,
            0
          )
        )
          .toBe("full-coverage");
      }
    );


    it(
      "builds per-race rows and classifies form/hp independently",
      () => {
        const rows =
          buildRaceFieldCoverage([
            {
              city: "Adana",
              race_number: 4,
              total_runners: 11,
              missing_form: 11,
              missing_hp: 11,
              unexplained_missing_hp: 0
            },
            {
              city: "Adana",
              race_number: 1,
              total_runners: 10,
              missing_form: 0,
              missing_hp: 1,
              unexplained_missing_hp: 1
            }
          ]);

        expect(rows).toHaveLength(2);

        expect(rows[0])
          .toMatchObject({
            city: "Adana",
            raceNumber: 4,
            formCoverage:
              "likely-not-published",
            hpCoverage:
              "likely-not-published",
            unexplainedMissingHp: 0
          });

        expect(rows[1])
          .toMatchObject({
            city: "Adana",
            raceNumber: 1,
            formCoverage:
              "full-coverage",
            hpCoverage:
              "partial-gap",
            unexplainedMissingHp: 1
          });
      }
    );


    it(
      "does not count a short-form (insufficient history) HP gap as unexplained",
      () => {
        /*
         * TJK's own real pattern: a runner with a one-race form
         * string ("7") has genuinely not been assigned an HP yet.
         * unexplained_missing_hp is computed upstream in SQL, so a
         * caller reporting 0 here means "explained", and this test
         * exists to lock in that the alarm logic reads that field
         * rather than re-deriving it from missingHp.
         */
        const rows =
          buildRaceFieldCoverage([
            {
              city: "Adana",
              race_number: 1,
              total_runners: 10,
              missing_form: 0,
              missing_hp: 1,
              unexplained_missing_hp: 0
            }
          ]);

        expect(
          rows[0].unexplainedMissingHp
        )
          .toBe(0);

        expect(rows[0].hpCoverage)
          .toBe("partial-gap");
      }
    );
  }
);
