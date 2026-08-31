/*
 * The client only ever sees the anonymized expert consensus
 * (expertConsensus.expertScore/labels) — never which sites
 * produced it or their raw per-source comments. getToday()'s
 * result is shared internally with the coupon generator and the
 * learning pipeline, which both need the raw per-source rows, so
 * the redaction happens here, once, at the one route that hands
 * the result to the public.
 *
 * shadowModelScore is a full second copy of modelScore's shape --
 * production's own comment on it says it is "never served as
 * production prediction before gate", i.e. it exists purely for
 * server-side shadow-mode comparison against the learning-gated
 * score, not for any client to read. It was ~27% of /api/today's
 * runner payload for zero behavioral purpose to a caller.
 */
/*
 * race_history's stored snapshot_json is the exact pre-race payload,
 * including the raw per-source expertPredictions rows (source_key,
 * comment, content_hash) that toPublicMeetings above exists to keep
 * away from any client. /api/history serves those snapshots directly
 * and never passed through that redaction -- this closes the same
 * gap for historical entries.
 *
 * The app's History screen shows how many expert rows a past race
 * had (not who they were from), so the count is kept explicitly
 * rather than just deleting the array out from under it.
 */
import type {
  MembershipTier
} from "../membership/tier";

import {
  stripPremiumRunnerSignals,
  stripPremiumRaceSignals
} from "../membership/tier";

/*
 * Free-tier callers see raw TJK program data (schedule, runner
 * identity, form) but never the proprietary analysis layer
 * (model score, expert consensus, market/field signals, race
 * uncertainty, coupon strategy) -- that is the paid product.
 */
export function toPublicHistory(
  entries: any[],
  tier: MembershipTier = "premium"
): any[] {
  return entries.map(
    entry => {
      const {
        expertPredictions,
        ...publicEntry
      } = entry;

      const withCount = {
        ...publicEntry,

        expertPredictionCount:
          Array.isArray(expertPredictions)
            ? expertPredictions.length
            : 0
      };

      if (
        tier !== "free" ||
        !Array.isArray(
          withCount.runners
        )
      ) {
        return withCount;
      }

      return {
        ...withCount,

        runners:
          withCount.runners.map(
            stripPremiumRunnerSignals
          )
      };
    }
  );
}


export function toPublicMeetings(
  meetings: any[],
  tier: MembershipTier = "premium"
): any[] {
  return meetings.map(
    meeting => ({
      ...meeting,

      races:
        (meeting.races ?? []).map(
          (race: any) => {
            const publicRace =
              tier === "free"
                ? stripPremiumRaceSignals(
                    race
                  )
                : race;

            return {
              ...publicRace,

              runners:
                (race.runners ?? []).map(
                  (runner: any) => {
                    const {
                      expertPredictions,
                      shadowModelScore,
                      ...publicRunner
                    } = runner;

                    return tier === "free"
                      ? stripPremiumRunnerSignals(
                          publicRunner
                        )
                      : publicRunner;
                  }
                )
            };
          }
        )
    })
  );
}
