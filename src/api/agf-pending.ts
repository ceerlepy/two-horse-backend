/*
 * TJK opens AGF on race morning. Before that the learned model has no
 * anchor and scoring falls back to the old weighted score with missing
 * inputs. Such races are flagged so the app can say so in one notice;
 * the cards themselves stay as they are.
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


export function markAgfPending<T extends { races?: any[] }>(
  meetings: T[]
): T[] {
  return meetings.map(meeting => ({
    ...meeting,

    races: (meeting.races ?? []).map(race =>
      isAgfPending(race) ? { ...race, agfPending: true } : race
    )
  }));
}
