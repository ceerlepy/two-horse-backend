# Two Horse Documentation Hub

Bu klasör backend'in engineering bilgi tabanıdır.

## 1. ARCHITECTURE-DEEP-DIVE.md

Ana semantic architecture kitabı.

Şunları açıklar:

- büyük resim
- canonical TJK authority
- acquisition
- parser
- normalization
- persistence
- reconciliation
- expert pipeline
- form
- HP
- weight
- market
- field
- scoring
- missing-feature renormalization
- confidence
- probability transform
- six-fold coverage
- Cartesian cost
- global optimizer
- six-fold windows
- snapshot lifecycle
- idempotency
- learning
- temporal leakage
- official results
- learning gate
- logging
- clean-code boundaries
- incident examples
- expert source health (effective vs raw status)
- form/HP coverage classification
- field-signal race-level coverage bias
- the three calibration mechanisms (expert-source weight, expert-category
  weight, horse/jockey/pair context priors)
- sixfold coupon evaluation completeness
- sixfold probability self-calibration
- mobile payload discipline
- refresh cadence as cost policy
- coupon optimizer per-leg selection-count mechanism (worked example)
- fivefold ganyan (Beşli Ganyan)
- horse video archive

## 2. DEBUG_API_REFERENCE.md

Diagnostic endpoint ansiklopedisi.

Her endpoint için mümkün olduğunca:

- method
- path
- auth
- query inputs
- defaults
- curl
- response
- response field anlamları
- DB ilişkileri
- interpretation
- next investigation step

açıklanır.

## 3. SOURCE_AND_DATABASE_ATLAS.md

Repository'nin fiziksel atlası.

Her TypeScript file için:

- imports
- exports
- declarations
- SQL references
- investigation questions

DB tarafında:

- table semantics
- ownership
- identity
- lifecycle
- freshness
- downstream impact
- diagnostics
- migration history

bulunur.

## 4. DIAGNOSTICS-RUNBOOK.md

Incident-response kısa rehberi.

## 5. DATABASE-GUIDE.md

D1 ownership ve lifecycle modeli.

## 6. ALGORITHMS-AND-STRATEGY.md

Scoring ve coupon strategy özeti.

## 7. tjk-production-validation.md

Production acceptance test planı.

---

# Recommended reading order

1. ARCHITECTURE-DEEP-DIVE.md
2. SOURCE_AND_DATABASE_ATLAS.md
3. DEBUG_API_REFERENCE.md
4. src/index.ts
5. src/api/router.ts
6. src/tjk
7. src/storage
8. src/scoring
9. src/coupons
10. src/learning
11. src/results
12. src/experts
13. src/market
14. src/field
15. migrations

---

# Recommended production debugging order

HEALTH
→ INVARIANTS
→ CARD
→ REFRESH STATE
→ DATA QUALITY
→ RACE
→ RUNNER
→ DB
→ SOURCE
→ SCORING
→ COUPON
→ LEARNING

Downstream symptom görülünce upstream evidence kontrol edilmeden kod değiştirilmez.

---

# Core invariants

1. Canonical TJK identity external source ile overwrite edilmez.
2. captured_at < starts_at.
3. Official result pre-race feature değildir.
4. GET coupon generation snapshot persist etmez.
5. Post-start prediction historical pre-race snapshot olmaz.
6. Missing scoring feature zero penalty değildir.
7. Coupon budget aşılmaz.
8. Snapshot identity idempotent olmalıdır.
9. Stale card/window reconcile edilmelidir.
10. Source failure canonical programı bozmamalıdır.
11. Credentials loglanmamalıdır.
12. Admin/debug fail-closed çalışmalıdır.

---

# Documentation maintenance rule

Model/scoring behavior değişirse:
ARCHITECTURE-DEEP-DIVE.md güncellenir.

Diagnostic contract değişirse:
DEBUG_API_REFERENCE.md güncellenir.

TS file veya migration eklenirse:
SOURCE_AND_DATABASE_ATLAS.md regenerate edilir.

Production acceptance değişirse:
tjk-production-validation.md güncellenir.


---

# Expert acquisition architecture

## EXPERT_ACQUISITION_ARCHITECTURE.md

Expert/comment source production architecture makalesidir.

Şunları tanımlar:

- discovery ve extraction responsibility boundary;
- SCRAPE DOM candidate discovery;
- semantic article selection;
- compact raw AI schema;
- coupon-number exclusion;
- semantic-empty ve technical-failure ayrımı;
- TJK canonical validation;
- date-aware daily-article cache;
- stable-page cache;
- AI/RTN cost invariants;
- provenance semantics;
- production debugging order.

Expert-source acquisition veya cache davranışı değişirse bu belge ve
REFRESH_POLICY.md birlikte güncellenmelidir.
