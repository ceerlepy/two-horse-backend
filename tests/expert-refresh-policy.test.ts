import {
  describe,
  expect,
  it
} from "vitest";

import {
  expertCheckIntervalMs
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
        ).toBeNull();


        expect(
          expertCheckIntervalMs(
            0
          )
        ).toBeNull();
      }
    );


    it(
      "uses tighter cadence near the next race",
      () => {
        expect(
          expertCheckIntervalMs(
            20
          )
        ).toBe(
          5 * 60_000
        );


        expect(
          expertCheckIntervalMs(
            90
          )
        ).toBe(
          10 * 60_000
        );


        expect(
          expertCheckIntervalMs(
            180
          )
        ).toBe(
          15 * 60_000
        );
      }
    );
  }
);
