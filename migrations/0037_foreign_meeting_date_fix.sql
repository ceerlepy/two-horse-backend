-- Foreign (YD) cards fetched just after midnight were stored under
-- the new day although TJK still listed the previous day's meetings
-- (fixed in src/foreign/service.ts). Drop rows whose source URL date
-- does not match their race_date; the cron refetches the real cards.
DELETE FROM foreign_meetings
WHERE instr(
  source_url,
  'QueryParameter_Tarih=' || substr(race_date, 9, 2) || '%2F'
    || substr(race_date, 6, 2) || '%2F' || substr(race_date, 1, 4)
) = 0;

-- Re-run foreign discovery on the next tick so the gear-tooltip
-- horse names are re-parsed with the fixed name reader.
DELETE FROM refresh_state WHERE pipeline_key = 'foreign.program';
