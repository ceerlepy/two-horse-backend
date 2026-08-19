export interface OfficialRunnerResult {
  horseNumber: number;
  horseName: string;
  finishPosition: number;
}

export interface OfficialRaceResult {
  raceNumber: number;
  runners: OfficialRunnerResult[];
}

export interface OfficialMeetingResults {
  city: string;
  raceDate: string;
  races: OfficialRaceResult[];
}
