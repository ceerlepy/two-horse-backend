-- TJK "Karma" is a composite programme, not a canonical venue.
--
-- Remove already persisted live/canonical rows.
--
-- Child tables first, then parent tables.

DELETE FROM agf_market_snapshots
WHERE lower(city) = lower('Karma');

DELETE FROM expert_predictions
WHERE lower(city) = lower('Karma');

DELETE FROM runners
WHERE lower(city) = lower('Karma');

DELETE FROM races
WHERE lower(city) = lower('Karma');

DELETE FROM meetings
WHERE lower(city) = lower('Karma');
