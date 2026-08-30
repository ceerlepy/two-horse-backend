import {
  describe,
  expect,
  it
} from "vitest";

import {
  buildSixFoldCouponHealth
} from "../src/api/diagnostics/sixfold";

import {
  SIXFOLD_STALE_AFTER_DAYS
} from "../src/coupons/repository";


describe(
  "sixfold coupon evaluation health (Part 11)",
  () => {
    it(
      "gives generous slack before treating a coupon as stuck",
      () => {
        expect(
          SIXFOLD_STALE_AFTER_DAYS
        ).toBeGreaterThanOrEqual(3);
      }
    );


    it(
      "reports ok when nothing pending has gone overdue",
      () => {
        const health =
          buildSixFoldCouponHealth({
            total: 10,
            evaluated: 7,
            pending: 3,
            unresolved: 0,
            overdue_unclassified: 0
          });

        expect(health).toEqual({
          total: 10,
          evaluated: 7,
          pending: 3,
          unresolved: 0,
          overdueUnclassified: 0,
          ok: true
        });
      }
    );


    it(
      "flags the pipeline unhealthy when a pending row is old enough to have been classified but wasn't",
      () => {
        /*
         * This is the actual health signal: evaluatePendingSixFold
         * Coupons runs on every cron tick and should have already
         * marked anything this old RESULTS_UNAVAILABLE. Seeing one
         * here means the cron itself stopped running, not that
         * results are merely slow.
         */
        const health =
          buildSixFoldCouponHealth({
            total: 6,
            evaluated: 3,
            pending: 2,
            unresolved: 1,
            overdue_unclassified: 1
          });

        expect(health.ok)
          .toBe(false);

        expect(health.overdueUnclassified)
          .toBe(1);
      }
    );


    it(
      "does not count a snapshot already marked unresolved as still pending",
      () => {
        const health =
          buildSixFoldCouponHealth({
            total: 6,
            evaluated: 3,
            pending: 0,
            unresolved: 3,
            overdue_unclassified: 0
          });

        expect(health.pending)
          .toBe(0);

        expect(health.unresolved)
          .toBe(3);

        expect(health.ok)
          .toBe(true);
      }
    );


    it(
      "defaults every field to zero for an empty row rather than throwing",
      () => {
        expect(
          buildSixFoldCouponHealth({} as any)
        ).toEqual({
          total: 0,
          evaluated: 0,
          pending: 0,
          unresolved: 0,
          overdueUnclassified: 0,
          ok: true
        });
      }
    );
  }
);
