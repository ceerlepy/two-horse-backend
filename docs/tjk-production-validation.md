# TJK Production Validation

Date: 2026-08-19

This document records the fixes, production validation, test commands and
observed results for Phase 1 of the Two Horse TJK ingestion pipeline.

Repository: `ceerlepy/two-horse-backend`

Production:
`https://two-horse-backend.veyseltosun-vt.workers.dev`

# Phase 1 — TJK Correctness

**FINAL STATUS: PASS**

---

## 1. HTTP fast-path

### Original problem

TJK master HTTP fetch succeeded, but meeting parsing could fail with:

```text
HTTP_FETCH: OK
HTTP_PARSE: TJK_NO_RACES
```

### Root cause

The TJK master page exposes meeting-specific city-detail links.

The pipeline discovered meeting names but reconstructed the city URL instead of
preserving and using the actual meeting URL supplied by TJK.

### Fix

Meeting discovery now retains:

- city
- discovered meeting URL

The discovered meeting URL is used for the direct HTTP request.

### Production verification

```text
master HTTP_FETCH: OK
master HTTP_PARSE: OK
meetings: 3

Elazığ HTTP_FETCH: OK
Elazığ HTTP_PARSE: OK

İstanbul HTTP_FETCH: OK
İstanbul HTTP_PARSE: OK

Karma HTTP_FETCH: OK
Karma HTTP_PARSE: OK
```

Direct HTTP is now the successful fast path.

The existing CF_SCRAPE / CF_CONTENT / CF_JSON fallback chain remains preserved.

---

## 2. distance_meters and track

### Original problem

Race and runner extraction worked, but:

```text
distance_meters: null
track: null
```

### Investigation

The existing `horsai` repository was inspected as a known-working TJK
implementation.

TJK exposes race headings and race metadata using `h3` elements.

The relevant structure contains values such as:

```text
1. Koşu 17.45
1200 Kum
1600 Çim
1400 Sentetik
```

TJK may also contain duplicate navigation/detail race headings.

### Fix

The parser now:

1. reads `h3` elements in document order;
2. identifies race headings;
3. searches subsequent relevant metadata headings;
4. extracts distance;
5. extracts Çim/Kum/Sentetik;
6. tolerates duplicate navigation/detail headings;
7. enriches the race from the usable detail occurrence.

### Production verification

```text
Elazığ 1 1200 Kum
Elazığ 2 1800 Kum
Elazığ 3 1500 Kum
Elazığ 4 1700 Kum
Elazığ 5 1200 Kum
Elazığ 6 1800 Kum
Elazığ 7 1200 Kum
Elazığ 8 1900 Kum

Karma 1 1600 Çim
Karma 2 1400 Sentetik
Karma 3 1200 Kum
Karma 4 1200 Sentetik
Karma 5 1800 Kum
Karma 6 1500 Kum

İstanbul 1 1900 Çim
İstanbul 2 1400 Sentetik
İstanbul 3 1600 Çim
İstanbul 4 1400 Çim
İstanbul 5 1400 Çim
İstanbul 6 1600 Çim
İstanbul 7 1400 Sentetik
İstanbul 8 1200 Sentetik
```

Result:

```text
distance_meters: PASS
track: PASS
```

---

# TESTS

## Test 1 — distance / track production check

### Command

```bash
BASE_URL="https://two-horse-backend.veyseltosun-vt.workers.dev"

curl -s -X POST "$BASE_URL/api/admin/refresh-tjk" >/dev/null

curl -s "$BASE_URL/api/today" | \
python -c 'import sys,json; d=json.load(sys.stdin); [(print(m["city"], r["race_number"], r["distance_meters"], r["track"])) for m in d["meetings"] for r in m["races"]]'
```

### Result

All 22 races returned populated distance and track values.

**PASS**

---

## Test 2 — API data integrity

### Command

```bash
BASE_URL="https://two-horse-backend.veyseltosun-vt.workers.dev"

curl -s "$BASE_URL/api/today" > "$HOME/today.json"

python - <<'PY'
import json
from pathlib import Path

d = json.loads(Path.home().joinpath("today.json").read_text())

meetings = d.get("meetings", [])
print("meetings:", len(meetings))

total_races = 0
total_runners = 0
bad = []

for m in meetings:
    city = m["city"]
    seen_races = set()

    for r in m["races"]:
        total_races += 1
        rn = r["race_number"]

        if rn in seen_races:
            bad.append(f"DUP RACE {city} R{rn}")
        seen_races.add(rn)

        if r.get("distance_meters") is None:
            bad.append(f"MISSING DISTANCE {city} R{rn}")

        if not r.get("track"):
            bad.append(f"MISSING TRACK {city} R{rn}")

        runners = r.get("runners", [])
        total_runners += len(runners)

        if not runners:
            bad.append(f"NO RUNNERS {city} R{rn}")

        seen_horses = set()

        for h in runners:
            n = h["horse_number"]

            if n in seen_horses:
                bad.append(f"DUP HORSE {city} R{rn} #{n}")

            seen_horses.add(n)

print("races:", total_races)
print("runners:", total_runners)

if bad:
    print("\nPROBLEMS:")
    for x in bad:
        print("-", x)
else:
    print("\nPHASE1 DATA INTEGRITY: OK")
PY
```

### Observed result

```text
meetings: 3
races: 22
runners: 243

PHASE1 DATA INTEGRITY: OK
```

Validated:

- duplicate races: NONE
- duplicate runners: NONE
- races without runners: NONE
- missing distance: NONE
- missing track: NONE

**PASS**

---

## Test 3 — repeated-refresh idempotency

### Command

```bash
BASE_URL="https://two-horse-backend.veyseltosun-vt.workers.dev"

curl -s "$BASE_URL/api/today" > "$HOME/today-before.json"

python - <<'PY'
import json
from pathlib import Path

d=json.loads(Path.home().joinpath("today-before.json").read_text())

races=sum(len(m["races"]) for m in d["meetings"])
runners=sum(len(r["runners"]) for m in d["meetings"] for r in m["races"])
finalized=sum(1 for m in d["meetings"] for r in m["races"] if r.get("finalized_at"))

print("meetings:", len(d["meetings"]))
print("races:", races)
print("runners:", runners)
print("finalized:", finalized)
PY

curl -s -X POST "$BASE_URL/api/admin/refresh-tjk" >/dev/null
curl -s -X POST "$BASE_URL/api/admin/refresh-tjk" >/dev/null

curl -s "$BASE_URL/api/today" > "$HOME/today-after.json"

python - <<'PY'
import json
from pathlib import Path

before=json.loads(Path.home().joinpath("today-before.json").read_text())
after=json.loads(Path.home().joinpath("today-after.json").read_text())

def stats(d):
    meetings=len(d["meetings"])
    races=sum(len(m["races"]) for m in d["meetings"])
    runners=sum(len(r["runners"]) for m in d["meetings"] for r in m["races"])
    finalized=sum(1 for m in d["meetings"] for r in m["races"] if r.get("finalized_at"))

    keys=[
        (m["city"], r["race_number"])
        for m in d["meetings"]
        for r in m["races"]
    ]

    horse_keys=[
        (m["city"], r["race_number"], h["horse_number"])
        for m in d["meetings"]
        for r in m["races"]
        for h in r["runners"]
    ]

    return meetings,races,runners,finalized,keys,horse_keys

b=stats(before)
a=stats(after)

print("before meetings/races/runners:", b[:3])
print("after meetings/races/runners:", a[:3])
print("before finalized:", b[3])
print("after finalized:", a[3])

problems=[]

if b[:3] != a[:3]:
    problems.append("COUNTS CHANGED AFTER REPEATED REFRESH")

if len(a[4]) != len(set(a[4])):
    problems.append("DUPLICATE RACES AFTER REFRESH")

if len(a[5]) != len(set(a[5])):
    problems.append("DUPLICATE RUNNERS AFTER REFRESH")

if problems:
    print("\nPROBLEMS:")
    for p in problems:
        print("-",p)
else:
    print("\nIDEMPOTENCY: OK")
PY
```

### Observed result

```text
BEFORE
meetings: 3
races: 22
runners: 243
finalized: 11

AFTER TWO REFRESHES
meetings: 3
races: 22
runners: 243
finalized: 11

IDEMPOTENCY: OK
```

Validated:

- repeated refresh did not increase meetings
- repeated refresh did not increase races
- repeated refresh did not increase runners
- duplicate race keys were not created
- duplicate runner keys were not created
- finalized count remained stable

**PASS**

---

## Test 4 — starts_at / finalized_at semantics

### Command

```bash
BASE_URL="https://two-horse-backend.veyseltosun-vt.workers.dev"

curl -s "$BASE_URL/api/today" > "$HOME/today.json"

python - <<'PY'
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

d = json.loads(
    Path.home().joinpath("today.json").read_text()
)

TR = timezone(timedelta(hours=3))
now = datetime.now(timezone.utc).astimezone(TR)

print("NOW_TR:", now.isoformat(timespec="seconds"))

bad = []
past_not_finalized = []

for m in d["meetings"]:
    city = m["city"]

    for r in m["races"]:
        rn = r["race_number"]
        starts_at = r.get("starts_at")
        finalized_at = r.get("finalized_at")

        if not starts_at:
            bad.append(f"MISSING starts_at {city} R{rn}")
            continue

        start_utc = datetime.fromisoformat(
            starts_at.replace("Z", "+00:00")
        )

        start_tr = start_utc.astimezone(TR)

        is_past = start_tr <= now
        is_finalized = finalized_at is not None

        status = "FINALIZED" if is_finalized else "OPEN"

        print(
            f"{city:10} R{rn:<2} "
            f"{start_tr.strftime('%H:%M')} "
            f"{status}"
        )

        if not is_past and is_finalized:
            bad.append(
                f"FUTURE FINALIZED: {city} R{rn}"
            )

        if is_past and not is_finalized:
            past_not_finalized.append(
                f"{city} R{rn}"
            )

if bad:
    print("\nFINALIZED_AT SEMANTICS: FAIL")
    for x in bad:
        print("-",x)
else:
    print("\nFINALIZED_AT FUTURE-RACE CHECK: OK")

if past_not_finalized:
    print("\nPAST BUT NOT FINALIZED:")
    for x in past_not_finalized:
        print("-",x)
else:
    print("ALL PAST RACES FINALIZED: YES")
PY
```

### Observed result

Validation time:

```text
NOW_TR: 2026-08-19T18:01:31+03:00
```

Race state:

```text
Elazığ R1 17:45 FINALIZED
Elazığ R2 18:30 OPEN
Elazığ R3 19:00 OPEN
Elazığ R4 19:30 OPEN
Elazığ R5 20:00 OPEN
Elazığ R6 20:30 OPEN
Elazığ R7 21:00 OPEN
Elazığ R8 21:30 OPEN

Karma R1 17:00 FINALIZED
Karma R2 17:30 FINALIZED
Karma R3 17:45 FINALIZED
Karma R4 18:00 FINALIZED
Karma R5 18:30 OPEN
Karma R6 19:00 OPEN

İstanbul R1 14:30 FINALIZED
İstanbul R2 15:00 FINALIZED
İstanbul R3 15:30 FINALIZED
İstanbul R4 16:00 FINALIZED
İstanbul R5 16:30 FINALIZED
İstanbul R6 17:00 FINALIZED
İstanbul R7 17:30 FINALIZED
İstanbul R8 18:00 FINALIZED
```

Invariant result:

```text
FINALIZED_AT FUTURE-RACE CHECK: OK
ALL PAST RACES FINALIZED: YES
```

Validated:

- no future race was finalized
- all races whose start time had passed were finalized
- UTC/Turkey conversion matched TJK race times

**PASS**

---

# Phase 1 Final Result

```text
Meeting discovery        PASS
HTTP_FETCH               PASS
HTTP_PARSE               PASS
Runner extraction        PASS
distance_meters          PASS
track                    PASS
API integrity            PASS
Duplicate race check     PASS
Duplicate runner check   PASS
Repeated refresh         PASS
Idempotency              PASS
starts_at timezone       PASS
finalized_at             PASS
CF fallback preserved    YES
```

## PHASE 1 RESULT: PASS

The TJK correctness baseline is established.

Future TJK parser/extraction changes must preserve these regression criteria.

TJK correctness must remain green before expert/scoring/UI work is allowed to
change the production pipeline.


---

# Phase 2 — Backend Completion Production Validation

STATUS: PENDING LIVE VALIDATION

Run these checks during the next production validation session.

Security prerequisite:
Configure the Cloudflare Worker secret named ADMIN_TOKEN.
Never commit the token value to GitHub.

Test 5 — Operational authentication
- /api/admin/* without token must return 401.
- /api/debug/* without token must return 401.
- If ADMIN_TOKEN is missing, protected endpoints must fail closed with 503.
- Correct Bearer token or X-Admin-Token must succeed.
- /api/health and /api/today remain public.

Test 6 — GET coupon generation read-only
- Record sixfold_coupon_snapshots count.
- Call GET /api/coupons/generate repeatedly.
- Snapshot count must remain unchanged.
- Response must report snapshotPersisted false.
- Response reason must be read-only-request.

Test 7 — Pre-race POST snapshot
- Before the first selected leg starts, authenticated POST generation must report snapshotPersisted true.
- Reason must be pre-race-frozen.
- Repeating identical POST must remain idempotent.

Test 8 — Post-start protection
- After any selected leg has started, authenticated POST must not persist.
- Reason must be race-already-started.
- No post-start snapshot may enter historical evaluation.

Test 9 — Global maximum coverage
- Every coupon must remain within requested budget.
- Maximum-coverage survival probability must be at least cautious and balanced.
- Unused budget is acceptable if no higher-survival legal combination fits.

Test 10 — Official TJK sixfold windows
- Prefer source tjk-program when explicit TJK metadata exists.
- canonical-program is fallback only.
- No stale windows or stale cities may remain.

Test 11 — Current-card reconciliation
- Refresh current TJK program.
- Coverage must contain only cities in the authoritative current card.

Test 12 — Learning and results
- invalidCaptureTiming must remain zero.
- Official results must label already-captured pre-race data only.
- Completed sixfold coupons must receive evaluated_at, hit_legs, six_of_six and five_of_six.

Test 13 — Expert, market and field coverage
- Validate current-card market coverage.
- Validate field scored coverage where source data exists.
- Validate expert coverage after publishers release the current card.
- Individual source failures must degrade gracefully.

Phase 2 completion requires all tests above plus CI PASS.
