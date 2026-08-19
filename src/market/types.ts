export interface AgfSnapshotPoint {
  agfPercent: number;
  capturedAt: string;
}

export interface MarketMovement {
  score: number | null;

  sampleSize: number;

  firstAgf: number | null;
  latestAgf: number | null;

  absoluteDelta: number | null;
  relativeDelta: number | null;

  spanMinutes: number;

  direction:
    | "strong-up"
    | "up"
    | "flat"
    | "down"
    | "strong-down"
    | "unknown";
}
