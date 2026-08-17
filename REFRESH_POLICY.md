# Two Horse refresh & retention policy

## TJK canonical program
- Source of truth: D1 after validation.
- Cold start / empty day: full Browser `/json` extraction.
- Full program TTL: 60 minutes.
- The extracted canonical JSON is hashed; unchanged program does not rewrite canonical rows.
- On extraction failure the last validated D1 snapshot remains available.
- 15/30/60 minute backoff after consecutive upstream failures.
- TJK URL discovery runs only after the stored URL fails.

## Expert/comment sources
- Sources are checked concurrently with a concurrency cap of 3.
- >120 minutes to next race: check every 15 minutes.
- 30–120 minutes: every 10 minutes.
- 0–30 minutes: every 5 minutes.
- Once a race starts, its pre-race expert state is frozen into race_history.
- A cheap HTTP fetch is attempted first for content hashing; Browser Rendering is fallback for JS pages.
- If content hash is unchanged, no AI extraction runs.
- Changed content is extracted into a strict schema and validated against canonical TJK horse number/name identity before UPSERT.
- Invalid/mismatched picks are rejected and logged as anomalies; they never affect scoring.

## AGF / market data
- Canonical hourly extraction currently refreshes AGF too.
- A separate high-frequency market adapter is intentionally isolated from the canonical pipeline. It should use TJK's official/lightweight AGF service when an authorized endpoint/key is configured; do not spend Browser `/json` every 2 minutes.
- Target policy once the lightweight adapter is configured: >60 min 10m; 15–60 min 5m; 0–15 min 2m; stop at race start.

## Request behavior
- `/api/today` always reads D1 first and returns immediately.
- User refresh does not synchronously fan out to 8 sites or TJK.
- Stale data triggers background refresh with `waitUntil`.
- Cron wakes every 5 minutes, but policy gates decide whether any upstream call is actually due.

## Retention
- Operational race/expert rows: today + previous 2 Turkey calendar days.
- Race history: immutable finalized snapshots, also max 2 days.
- source_runs/anomalies: 7 days for diagnostics.
- source registries are durable and are not cleaned.
- Operational rows are only deleted after a race_history snapshot exists.
