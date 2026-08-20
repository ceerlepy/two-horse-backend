# Debug API Reference

Bütün /api/debug/* endpointleri ADMIN_TOKEN ister.

## Core

GET /api/debug/health/deep

D1 erişimi, degraded source sayısı ve invalid learning snapshot timing.

GET /api/debug/invariants

Cross-table correctness.

GET /api/debug/card

Current canonical card city/race/runner summary.

GET /api/debug/race?city=CITY&race=N

Tek yarış + bütün runners.

GET /api/debug/runner?city=CITY&race=N&horse=N

Tek atın canonical row, expert predictions, market snapshots ve field signals trace'i.

GET /api/debug/db/schema

D1 sqlite_master schema.

GET /api/debug/db/counts

Her table row count.

GET /api/debug/scoring-config

Model weights ve model/learning/coupon policy versions.

## Existing diagnostics

GET /api/debug/sixfold

GET /api/debug/sources

GET /api/debug/learning

GET /api/debug/learning-pipeline

GET /api/debug/model

GET /api/debug/coverage

GET /api/debug/refresh-state

## Recommended problem flow

health/deep
-> invariants
-> card
-> coverage
-> race
-> runner
-> exact table/schema
