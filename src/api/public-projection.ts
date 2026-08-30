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
export function toPublicHistory(
  entries: any[]
): any[] {
  return entries.map(
    entry => {
      const {
        expertPredictions,
        ...publicEntry
      } = entry;

      return {
        ...publicEntry,

        expertPredictionCount:
          Array.isArray(expertPredictions)
            ? expertPredictions.length
            : 0
      };
    }
  );
}


export function toPublicMeetings(
  meetings: any[]
): any[] {
  return meetings.map(
    meeting => ({
      ...meeting,

      races:
        (meeting.races ?? []).map(
          (race: any) => ({
            ...race,

            runners:
              (race.runners ?? []).map(
                (runner: any) => {
                  const {
                    expertPredictions,
                    shadowModelScore,
                    ...publicRunner
                  } = runner;

                  return publicRunner;
                }
              )
          })
        )
    })
  );
}
