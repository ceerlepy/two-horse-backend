import {
  describe,
  expect,
  it
} from "vitest";

import {
  toPublicHistory,
  toPublicMeetings
} from "../src/api/public-projection";


function meetingWith(
  runner: Record<string, unknown>
) {
  return [
    {
      city: "Adana",

      races: [
        {
          race_number: 1,
          runners: [runner]
        }
      ]
    }
  ];
}


describe(
  "public /api/today projection (Part 12)",
  () => {
    it(
      "strips raw per-source expert predictions",
      () => {
        const [meeting] =
          toPublicMeetings(
            meetingWith({
              horse_number: 1,
              expertPredictions: [
                { source_key: "afa", comment: "x" }
              ]
            })
          );

        const [runner] =
          meeting.races[0].runners;

        expect(
          "expertPredictions" in runner
        ).toBe(false);
      }
    );


    it(
      "strips the internal shadow-mode score copy",
      () => {
        const [meeting] =
          toPublicMeetings(
            meetingWith({
              horse_number: 1,

              modelScore: {
                score: 60,
                confidence: 1
              },

              shadowModelScore: {
                score: 65,
                confidence: 1
              }
            })
          );

        const [runner] =
          meeting.races[0].runners;

        expect(
          "shadowModelScore" in runner
        ).toBe(false);

        /*
         * The production score callers actually use must survive
         * untouched -- this is a redaction, not a truncation of
         * the runner shape.
         */
        expect(runner.modelScore)
          .toEqual({
            score: 60,
            confidence: 1
          });
      }
    );


    it(
      "leaves the rest of the runner shape untouched",
      () => {
        const [meeting] =
          toPublicMeetings(
            meetingWith({
              horse_number: 7,
              horse_name: "TEST HORSE",
              agf_percent: 40
            })
          );

        expect(
          meeting.races[0].runners[0]
        ).toEqual({
          horse_number: 7,
          horse_name: "TEST HORSE",
          agf_percent: 40
        });
      }
    );
  }
);


describe(
  "public /api/history projection (Part 12)",
  () => {
    it(
      "strips raw per-source expert predictions from historical snapshots",
      () => {
        const [entry] =
          toPublicHistory([
            {
              raceDate: "2026-08-29",
              city: "Adana",
              raceNumber: 1,

              expertPredictions: [
                {
                  source_key: "afa",
                  comment: "x"
                }
              ],

              runners: [
                { horse_number: 1 }
              ]
            }
          ]);

        expect(
          "expertPredictions" in entry
        ).toBe(false);

        expect(entry.expertPredictionCount)
          .toBe(1);

        expect(entry.runners)
          .toEqual([
            { horse_number: 1 }
          ]);
      }
    );


    it(
      "reports zero for an entry with no expert predictions",
      () => {
        const [entry] =
          toPublicHistory([
            {
              raceDate: "2026-08-29",
              city: "Adana",
              raceNumber: 1
            }
          ]);

        expect(entry.expertPredictionCount)
          .toBe(0);
      }
    );
  }
);
