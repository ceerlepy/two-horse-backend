# Two Horse Code Map

| Area | Primary responsibility |
|---|---|
| src/api | HTTP routing, auth boundary, diagnostics |
| src/api/diagnostics | Small operational probes |
| src/tjk | TJK ingestion and program refresh |
| src/storage | Persistence/repositories |
| src/experts | Expert-source ingestion |
| src/form | Horse-form enrichment |
| src/field | Field/context signals |
| src/scoring | Feature weighting and scoring |
| src/model | Model/policy versions |
| src/coupons | Coupon generation and optimization |
| src/history | Historical snapshots/results |
| src/observability | Structured operational logging |
| tests | Behavioral/invariant protection |
| docs | Architecture and operational knowledge |

# Dependency direction

API
↓
services
↓
domain operations
↓
repositories/source adapters

Cross-cutting:

auth
observability
versions
diagnostics

# Investigation principle

Dosya adı değil responsibility takip edilir.

Bir bug birden fazla katmanda symptom üretebilir fakat root cause mümkün
olduğunca tek owning subsystem'e atanmalıdır.
