import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildRaceFieldSignalCoverage,
  classifyFieldCoverage,
  suppressPartialFieldCoverage
} from "../src/field/coverage";


describe(
  "race-level field signal coverage (Part 9)",
  () => {
    it(
      "classifies zero coverage as no-data",
      () => {
        expect(
          classifyFieldCoverage(10, 0)
        )
          .toBe("no-data");
      }
    );


    it(
      "classifies a small covered minority as partial-data",
      () => {
        expect(
          classifyFieldCoverage(10, 1)
        )
          .toBe("partial-data");
      }
    );


    it(
      "classifies majority coverage as full-data",
      () => {
        expect(
          classifyFieldCoverage(10, 8)
        )
          .toBe("full-data");
      }
    );


    it(
      "treats a race with no runners as no-data rather than dividing by zero",
      () => {
        expect(
          classifyFieldCoverage(0, 0)
        )
          .toBe("no-data");
      }
    );


    it(
      "nulls field_score for every runner when coverage is 1/10, not just the uncovered ones",
      () => {
        const runners =
          Array.from(
            { length: 10 },
            (_, index) => ({
              horseNumber: index + 1,

              field_score:
                index === 0
                  ? 82
                  : null,

              fieldSignal: {
                score:
                  index === 0
                    ? 82
                    : null,

                tjkScore:
                  index === 0
                    ? 82
                    : null,

                expertScore: null
              }
            })
          );

        const result =
          suppressPartialFieldCoverage(
            runners
          );

        expect(result.coverageState)
          .toBe("partial-data");

        for (const runner of result.runners) {
          expect(runner.field_score)
            .toBeNull();

          expect(runner.fieldSignal?.score)
            .toBeNull();
        }

        /*
         * The underlying TJK observation stays visible for
         * diagnostics -- only the score fed into scoring is
         * suppressed.
         */
        expect(
          result.runners[0].fieldSignal?.tjkScore
        )
          .toBe(82);
      }
    );


    it(
      "leaves a sufficiently-covered race untouched",
      () => {
        const runners =
          Array.from(
            { length: 10 },
            (_, index) => ({
              horseNumber: index + 1,

              field_score:
                index < 8
                  ? 60 + index
                  : null,

              fieldSignal: {
                score:
                  index < 8
                    ? 60 + index
                    : null
              }
            })
          );

        const result =
          suppressPartialFieldCoverage(
            runners
          );

        expect(result.coverageState)
          .toBe("full-data");

        expect(
          result.runners.map(
            runner => runner.field_score
          )
        )
          .toEqual(
            runners.map(
              runner => runner.field_score
            )
          );
      }
    );


    it(
      "builds per-race diagnostic rows straight from a raw DB join",
      () => {
        const rows =
          buildRaceFieldSignalCoverage([
            {
              city: "Adana",
              race_number: 3,
              total_runners: 10,
              covered_runners: 1
            },
            {
              city: "Adana",
              race_number: 1,
              total_runners: 8,
              covered_runners: 8
            }
          ]);

        expect(rows).toHaveLength(2);

        expect(rows[0])
          .toMatchObject({
            city: "Adana",
            raceNumber: 3,
            coverageState: "partial-data"
          });

        expect(rows[1])
          .toMatchObject({
            city: "Adana",
            raceNumber: 1,
            coverageState: "full-data"
          });
      }
    );


    it(
      "leaves a race with no field data at all as no-data without crashing",
      () => {
        const runners =
          Array.from(
            { length: 6 },
            (_, index) => ({
              horseNumber: index + 1,
              field_score: null
            })
          );

        const result =
          suppressPartialFieldCoverage(
            runners
          );

        expect(result.coverageState)
          .toBe("no-data");

        for (const runner of result.runners) {
          expect(runner.field_score)
            .toBeNull();
        }
      }
    );
  }
);
