-- horse_form_history was created in 0005 but never filled: the
-- collector only ran from an admin endpoint. It now runs from the
-- cron (src/form/service.ts) for every horse on today's and
-- tomorrow's cards, keeping at most HORSE_FORM_CONFIG.maxRunsPerHorse
-- runs per horse. These columns keep the TJK race-history fields
-- needed for speed figures and class/trainer analysis.
ALTER TABLE horse_form_history ADD COLUMN finish_time TEXT;
ALTER TABLE horse_form_history ADD COLUMN finish_time_seconds REAL;
ALTER TABLE horse_form_history ADD COLUMN start_position INTEGER;
ALTER TABLE horse_form_history ADD COLUMN race_number INTEGER;
ALTER TABLE horse_form_history ADD COLUMN race_class TEXT;
ALTER TABLE horse_form_history ADD COLUMN trainer TEXT;
ALTER TABLE horse_form_history ADD COLUMN prize_tl REAL;

CREATE INDEX IF NOT EXISTS idx_horse_form_refresh_updated
ON horse_form_refresh_state(updated_at);

