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

  /*
   * Optional so older fixtures/callers stay valid. Raw TJK
   * "Derece" (e.g. "1.49.18") plus seconds, gate ("St"),
   * race number, race class ("Kcins"), trainer and prize.
   */
  finishTime?: string | null;
  finishTimeSeconds?: number | null;
  startPosition?: number | null;
  raceNumber?: number | null;
  raceClass?: string | null;
  trainer?: string | null;
  prizeTl?: number | null;
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
