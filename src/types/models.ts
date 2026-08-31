export interface RunnerInput {
  number: number;
  name: string;
  jockey: string | null;
  weight: number | null;
  hp: number | null;
  agfPercent: number | null;

  /*
   * TJK "Son 6 Y." value exactly as displayed.
   *
   * Examples:
   *   3223-66
   *   558635
   *   001311
   *
   * Keep raw source data; scoring is a separate concern.
   */
  recentFormRaw: string | null;

  horseProfileUrl: string | null;

  /*
   * Race-specific jockey profile.
   * The same horse may race with different jockeys.
   */
  jockeyProfileUrl: string | null;
}

export interface RaceInput {
  raceNumber: number;
  time: string | null;
  distanceMeters: number | null;
  track: string | null;

  /*
   * TJK "Detaylı At Karşılaştırma".
   *
   * This URL is already parameterized by the
   * current venue, distance, surface and race code.
   */
  performanceUrl?: string | null;

  /*
   * Official TJK six-fold start markers attached
   * to this race.
   *
   * Example:
   *   [1]    -> 1st six-fold starts here
   *   [2]    -> 2nd six-fold starts here
   *   [1, 2] -> both start here
   */
  sixfoldStartNumbers?: number[];

  /*
   * Official TJK five-fold (Beşli Ganyan) start markers,
   * same shape/semantics as sixfoldStartNumbers.
   */
  fivefoldStartNumbers?: number[];

  runners: RunnerInput[];
}

export interface MeetingInput {
  city: string;
  races: RaceInput[];
}

export interface TjkProgramInput {
  /*
   * Authoritative date belonging to the extracted
   * TJK race card.
   */
  raceDate?: string;

  meetings: MeetingInput[];
}

export interface ExpertPickInput {
  city: string;
  raceNumber: number;
  horseNumber: number;
  horseName: string | null;
  comment: string | null;
  isFavorite: boolean;
  isBanko: boolean;
  isStrong: boolean;
  isStar: boolean;
  isRival: boolean;
  isSurprise: boolean;
  isAvoid: boolean;
  sourceRank: number | null;
  confidence: number;
}

export interface ExpertExtractionInput { picks: ExpertPickInput[] }
