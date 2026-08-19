import type {
  TjkProgramInput
} from "../types/models";

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

export function filterCanonicalTjkMeetings<
  T extends MeetingLike
>(
  meetings: T[]
): T[] {
  return meetings.filter(
    meeting =>
      !isCompositeTjkMeetingName(
        meeting.city
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
