export interface RunnerInput {
  number: number;
  name: string;
  jockey: string | null;
  weight: number | null;
  hp: number | null;
  agfPercent: number | null;
}

export interface RaceInput {
  raceNumber: number;
  time: string | null;
  distanceMeters: number | null;
  track: string | null;
  runners: RunnerInput[];
}

export interface MeetingInput {
  city: string;
  races: RaceInput[];
}

export interface TjkProgramInput { meetings: MeetingInput[] }

export interface ExpertPickInput {
  city: string;
  raceNumber: number;
  horseNumber: number;
  horseName: string;
  comment: string | null;
  isFavorite: boolean;
  isBanko: boolean;
  isStrong: boolean;
  isStar: boolean;
  sourceRank: number | null;
  confidence: number;
}

export interface ExpertExtractionInput { picks: ExpertPickInput[] }
