-- Tomorrow's (D+1) TJK program, shown by the app once today's races
-- are over. Read-only display data: one compact JSON document per
-- race date. Deliberately separate from meetings/races/runners so
-- nothing that scores, captures AGF or learns ever sees it.
CREATE TABLE IF NOT EXISTS next_day_programs (
  race_date TEXT PRIMARY KEY,
  program_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
