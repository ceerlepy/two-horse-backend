import type {
  TjkProgramInput
} from "../types/models";

import {
  countryOfForeignMeeting
} from "../foreign/discovery";

import {
  foreignCountryGroup
} from "../foreign/calibration";

export interface MeetingLike {
  city: string;
  url: string;
}

function normalizeMeetingName(
  value: string
): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("tr-TR");
}

/*
 * TJK "Karma" is a composite programme.
 *
 * It is NOT a physical domestic venue like:
 * İstanbul / Elazığ / İzmir / Bursa / Ankara.
 *
 * It may reference races originating from real venues.
 *
 * Therefore:
 *
 * - master discovery may see it;
 * - canonical ingestion must not persist it as a venue;
 * - scoring must not score it independently;
 * - market history must not snapshot it independently;
 * - coupon generation must not see duplicate races through it.
 */
export function isCompositeTjkMeetingName(
  value: string
): boolean {
  return (
    normalizeMeetingName(value) ===
    "karma"
  );
}

/*
 * A foreign (TJK "YD") meeting that slipped past the "(YD n)" label
 * check. On 9 Oct 2026 tomorrow's stored card carried seven of them
 * (Turffontein, Chantilly, York, ...) next to Ankara, İzmir and
 * Diyarbakır, so the home screen listed them as Turkish meetings.
 * TJK names foreign venues "<Venue> <Country>" and gives them a SehirId
 * above the domestic range (1-9, Karma 17).
 */
export function isForeignTjkMeeting(
  city: string,
  url?: string | null
): boolean {
  if (
    countryOfForeignMeeting(city) ||
    foreignCountryGroup(city) !== "other"
  ) {
    return true;
  }

  if (url) {
    try {
      const id = Number(
        new URL(url, "https://www.tjk.org").searchParams.get("SehirId")
      );

      if (Number.isInteger(id) && id > 17) return true;
    } catch {
      // not a URL: decided by name alone
    }
  }

  return false;
}

export function filterCanonicalTjkMeetings<
  T extends MeetingLike
>(
  meetings: T[]
): T[] {
  return meetings.filter(
    meeting =>
      !isCompositeTjkMeetingName(
        meeting.city
      ) &&
      !isForeignTjkMeeting(
        meeting.city,
        meeting.url
      )
  );
}

/*
 * Last defensive boundary before persistence.
 *
 * Composite programmes or duplicated canonical race
 * identities are forbidden.
 */
export function assertCanonicalTjkProgram(
  program:
    TjkProgramInput
): void {
  const seen =
    new Set<string>();

  for (
    const meeting of
    program.meetings
  ) {
    if (
      isCompositeTjkMeetingName(
        meeting.city
      )
    ) {
      throw new Error(
        `COMPOSITE_MEETING_IN_CANONICAL_PROGRAM:${meeting.city}`
      );
    }

    for (
      const race of
      meeting.races
    ) {
      const key =
        [
          meeting.city
            .trim()
            .toLocaleLowerCase(
              "tr-TR"
            ),

          race.raceNumber
        ].join("|");

      if (
        seen.has(key)
      ) {
        throw new Error(
          `DUPLICATE_CANONICAL_RACE:${meeting.city}:R${race.raceNumber}`
        );
      }

      seen.add(key);
    }
  }
}
