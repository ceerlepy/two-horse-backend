/*
 * Refresh cadence as a distance-to-race tier table, ordered nearest
 * first. Each tier's maxMinutes is the boundary UP TO which that
 * interval applies; the first matching tier wins. Both Workers AI
 * (extraction) and Browser Rendering (the puppeteer/scrape rung of
 * the acquisition ladder) are billed per use, and a far-off race
 * gains nothing from checking every 15 minutes -- nothing about a
 * source's content changes meaningfully hours before a card starts.
 * Tune cost/freshness here, nowhere else.
 *
 * The far tier is 6 hours, not "twice a day": this table only ever
 * fires once a race is already scheduled for today (no upcoming race
 * = no checks at all, see below), and a fixed elapsed-time interval
 * is what a 5-minute cron can enforce cleanly -- true calendar times
 * ("check at 08:00 and 14:00") would need wall-clock-aware logic this
 * table doesn't have. 6 hours still gives several checks across a
 * full racing day instead of one, so a source that publishes its
 * card late morning isn't sitting undiscovered until 2 hours before
 * the first race -- this app's whole point is showing today's expert
 * picks, not just the picks for whoever opens it in the last 2 hours.
 */
export const EXPERT_CHECK_CADENCE_TIERS: Array<{
  maxMinutes: number;
  intervalMinutes: number;
}> = [
  { maxMinutes: 30, intervalMinutes: 5 },
  { maxMinutes: 60, intervalMinutes: 10 },
  { maxMinutes: 120, intervalMinutes: 15 },
  { maxMinutes: Infinity, intervalMinutes: 360 }
];

export function expertCheckIntervalMs(
  minutesToNextRace:
    number | null
): number | null {
  /*
   * No upcoming canonical race:
   *
   * no expert Browser work
   * no expert Workers AI
   */
  if (
    minutesToNextRace ===
      null ||
    minutesToNextRace <=
      0
  ) {
    return null;
  }

  const tier =
    EXPERT_CHECK_CADENCE_TIERS.find(
      candidate =>
        minutesToNextRace <=
        candidate.maxMinutes
    ) ??
    EXPERT_CHECK_CADENCE_TIERS[
      EXPERT_CHECK_CADENCE_TIERS.length - 1
    ];

  return tier.intervalMinutes *
    60_000;
}


/*
 * A broken source must not consume semantic AI on every
 * global refresh.
 *
 * Backoff stays bounded so a recovered source can rejoin.
 *
 * Near the next race we shorten the cap.
 */
export function expertFailureBackoffMs(
  consecutiveFailures:
    number,

  minutesToNextRace:
    number | null
): number {
  const failures =
    Math.max(
      0,

      Math.floor(
        Number(
          consecutiveFailures
        ) ||
        0
      )
    );


  if (!failures) {
    return 0;
  }


  let minutes =
    failures ===
      1
      ? 15

      : failures ===
          2
        ? 30
        : 60;


  if (
    minutesToNextRace !==
      null &&
    minutesToNextRace <=
      30
  ) {
    minutes =
      Math.min(
        minutes,
        10
      );

  } else if (
    minutesToNextRace !==
      null &&
    minutesToNextRace <=
      120
  ) {
    minutes =
      Math.min(
        minutes,
        20
      );
  }


  return minutes *
    60_000;
}


export function expertFailureBackoffRemainingMs(
  consecutiveFailures:
    number,

  lastFailureAt:
    string |
    null |
    undefined,

  minutesToNextRace:
    number | null,

  nowMs =
    Date.now()
): number {
  if (!lastFailureAt) {
    return 0;
  }


  const failureTime =
    Date.parse(
      lastFailureAt
    );


  if (
    !Number.isFinite(
      failureTime
    )
  ) {
    return 0;
  }


  const backoff =
    expertFailureBackoffMs(
      consecutiveFailures,
      minutesToNextRace
    );


  return Math.max(
    0,

    failureTime +
      backoff -
      nowMs
  );
}
