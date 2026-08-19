export interface HorseHistoryRun {
  raceDate: string;

  city: string | null;
  distanceMeters: number | null;
  track: string | null;

  finishPosition: number | null;

  weight: number | null;
  jockey: string | null;
  odds: number | null;
  hp: number | null;
}

export interface HorseFormResult {
  score: number | null;

  sampleSize: number;

  recentPositions:
    number[];

  trend:
    | "improving"
    | "stable"
    | "declining"
    | "unknown";
}
