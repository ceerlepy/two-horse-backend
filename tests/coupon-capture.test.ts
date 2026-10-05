import { describe, expect, it } from "vitest";

import { couponWindows, isCaptureDue } from "../src/coupons/capture";

describe("coupon capture", () => {
  it("captures only in the last minutes before the first leg", () => {
    expect(isCaptureDue(null)).toBe(false);
    expect(isCaptureDue(-1)).toBe(false);
    expect(isCaptureDue(0)).toBe(false);
    expect(isCaptureDue(10)).toBe(true);
    expect(isCaptureDue(15)).toBe(true);
    expect(isCaptureDue(16)).toBe(false);
  });

  it("resolves altılı and beşli windows from TJK start metadata", () => {
    const races = Array.from({ length: 9 }, (_, index) => ({
      race_number: index + 1,
      sixfold_start_numbers_json: index + 1 === 4 ? "[1]" : null,
      fivefold_start_numbers_json: index + 1 === 5 ? "[1]" : null
    }));

    const windows = couponWindows(races);

    expect(windows).toContainEqual({ pool: "sixfold", windowNumber: 1, startRace: 4 });
    expect(windows).toContainEqual({ pool: "fivefold", windowNumber: 1, startRace: 5 });
  });

  it("returns no windows for a short card", () => {
    expect(couponWindows([{ race_number: 1 }, { race_number: 2 }])).toEqual([]);
  });
});
