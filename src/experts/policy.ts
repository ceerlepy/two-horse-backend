export function expertCheckIntervalMs(minutesToNextRace: number | null): number | null {
  if (minutesToNextRace === null) return 15 * 60_000;
  if (minutesToNextRace <= 0) return null;
  if (minutesToNextRace <= 30) return 5 * 60_000;
  if (minutesToNextRace <= 120) return 10 * 60_000;
  return 15 * 60_000;
}
