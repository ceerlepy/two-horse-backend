export function expertCheckIntervalMs(
  minutesToNextRace: number | null
): number | null {
  /*
   * Expert acquisition exists only to improve an upcoming
   * pre-race prediction.
   *
   * No upcoming canonical race means:
   *
   * - no expert source refresh;
   * - no Browser Run;
   * - no Workers AI / RTN usage.
   *
   * The Worker cron itself may continue because results,
   * history, learning and cleanup have independent jobs.
   */
  if (
    minutesToNextRace === null ||
    minutesToNextRace <= 0
  ) {
    return null;
  }


  if (
    minutesToNextRace <= 30
  ) {
    return 5 * 60_000;
  }


  if (
    minutesToNextRace <= 120
  ) {
    return 10 * 60_000;
  }


  return 15 * 60_000;
}
