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
      "uses tighter cadence near the next race",
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
            90
          )
        )
          .toBe(
            10 *
            60_000
          );


        expect(
          expertCheckIntervalMs(
            180
          )
        )
          .toBe(
            15 *
            60_000
          );
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
