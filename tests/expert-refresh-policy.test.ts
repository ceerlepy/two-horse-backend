import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertCheckIntervalMs,
  expertFailureBackoffMs,
  expertFailureBackoffRemainingMs
} from "../src/experts/policy";


describe(
  "expert refresh policy",
  () => {
    it(
      "stops when there is no upcoming race",
      () => {
        expect(
          expertCheckIntervalMs(
            null
          )
        )
          .toBeNull();


        expect(
          expertCheckIntervalMs(
            0
          )
        )
          .toBeNull();
      }
    );


    it(
      "uses tighter cadence near the next race, and every 6 hours far from it",
      () => {
        expect(
          expertCheckIntervalMs(
            20
          )
        )
          .toBe(
            5 *
            60_000
          );


        expect(
          expertCheckIntervalMs(
            45
          )
        )
          .toBe(
            10 *
            60_000
          );


        expect(
          expertCheckIntervalMs(
            90
          )
        )
          .toBe(
            15 *
            60_000
          );


        /*
         * Hours from the next race, nothing about a source's
         * content changes meaningfully in 15 minutes -- a few
         * checks spread across the day catch a late-published
         * card without paying for Workers AI / Browser Rendering
         * every 15 minutes all day.
         */
        expect(
          expertCheckIntervalMs(
            180
          )
        )
          .toBe(
            360 *
            60_000
          );
      }
    );


    it(
      "applies the tighter tier exactly at each boundary minute",
      () => {
        expect(
          expertCheckIntervalMs(30)
        ).toBe(5 * 60_000);

        expect(
          expertCheckIntervalMs(60)
        ).toBe(10 * 60_000);

        expect(
          expertCheckIntervalMs(120)
        ).toBe(15 * 60_000);

        expect(
          expertCheckIntervalMs(121)
        ).toBe(360 * 60_000);
      }
    );


    it(
      "backs off repeatedly failing sources",
      () => {
        expect(
          expertFailureBackoffMs(
            1,
            180
          )
        )
          .toBe(
            15 *
            60_000
          );


        expect(
          expertFailureBackoffMs(
            3,
            180
          )
        )
          .toBe(
            60 *
            60_000
          );


        /*
         * Near a race the cap is intentionally shorter.
         */
        expect(
          expertFailureBackoffMs(
            51,
            20
          )
        )
          .toBe(
            10 *
            60_000
          );
      }
    );


    it(
      "calculates remaining failure backoff",
      () => {
        const now =
          Date.parse(
            "2026-08-24T18:00:00.000Z"
          );


        expect(
          expertFailureBackoffRemainingMs(
            2,
            "2026-08-24T17:40:00.000Z",
            180,
            now
          )
        )
          .toBe(
            10 *
            60_000
          );
      }
    );
  }
);
