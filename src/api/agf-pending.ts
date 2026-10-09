/*
 * TJK opens AGF on race morning. Before that the learned model has no
 * anchor and scoring falls back to the old weighted score, which picks
 * the winner less often than the AGF favourite. A race with no AGF on
 * any runner is therefore served without scores, uncertainty or coupon
 * advice, and coupons for it are refused, until AGF arrives.
 */
export function isAgfPending(
  race: any
): boolean {
  const runners: any[] =
    Array.isArray(race?.runners) ? race.runners : [];

  return (
    runners.length > 0 &&
    runners.every(runner => runner?.agf_percent == null)
  );
}


export function hideScoresUntilAgf<T extends { races?: any[] }>(
  meetings: T[]
): T[] {
  return meetings.map(meeting => ({
    ...meeting,

    races: (meeting.races ?? []).map(race => {
      if (!isAgfPending(race)) return race;

      return {
        ...race,
        agfPending: true,
        uncertainty: null,
        couponStrategy: null,

        runners: race.runners.map((runner: any) =>
          runner?.modelScore
            ? {
                ...runner,
                modelScore: {
                  ...runner.modelScore,
                  score: null,
                  confidence: null,
                  winProbability: null
                }
              }
            : runner
        )
      };
    })
  }));
}
