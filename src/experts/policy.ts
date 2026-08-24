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


  if (
    minutesToNextRace <=
    30
  ) {
    return 5 *
      60_000;
  }


  if (
    minutesToNextRace <=
    120
  ) {
    return 10 *
      60_000;
  }


  return 15 *
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
