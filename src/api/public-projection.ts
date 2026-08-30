/*
 * The client only ever sees the anonymized expert consensus
 * (expertConsensus.expertScore/labels) — never which sites
 * produced it or their raw per-source comments. getToday()'s
 * result is shared internally with the coupon generator and the
 * learning pipeline, which both need the raw per-source rows, so
 * the redaction happens here, once, at the one route that hands
 * the result to the public.
 */
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
