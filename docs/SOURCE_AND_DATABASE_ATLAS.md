# Two Horse — Source and Database Atlas

Bu doküman repository'nin fiziksel kod yapısını, database yapısını ve runtime ilişkilerini tek yerde açıklar.

Amaç:
- hangi dosya ne yapıyor
- ne import ediyor
- ne export ediyor
- hangi DB tablolarına dokunuyor
- hangi katmana ait
- bozulursa ne etkilenir
- hangi diagnostic ile gözlenir

sorularına cevap vermektir.

---

# PART A — TYPESCRIPT SOURCE ATLAS

## src/acquisition/cloudflare-html.ts

### Imports

- ../env
- ./types

### Exports

- acquireCfScrapeHtml
- acquireCfContentHtml

### Main declarations

- DEFAULT_TIMEOUT_MS
- unwrap
- findHtml
- acquireCfScrapeHtml
- acquireCfContentHtml

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/acquisition/deterministic.ts

### Imports

- ../env
- ./http
- ./cloudflare-html
- ./types

### Exports

- ParsedAcquisition
- acquireAndParse

### Main declarations

- message
- ParsedAcquisition
- acquireAndParse

### SQL table references

- iteration

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/acquisition/http.ts

### Imports

- ./types

### Exports

- HttpFetchOptions
- acquireHttpHtml

### Main declarations

- HttpFetchOptions
- acquireHttpHtml

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/acquisition/semantic-json.ts

### Imports

- ../env
- ./cloudflare-html
- ./types

### Exports

- extractSemanticJson

### Main declarations

- message
- jsonRequest
- extractSemanticJson

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/acquisition/types.ts

### Imports

- none detected

### Exports

- AcquisitionStage
- AcquiredHtml
- AcquisitionFailure
- AcquisitionDiagnostics
- SemanticJsonResult

### Main declarations

- AcquisitionStage
- AcquiredHtml
- AcquisitionFailure
- AcquisitionDiagnostics
- SemanticJsonResult

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/api/auth.ts

### Imports

- ../env
- ../shared
- ../observability/logger

### Exports

- protectedOperationalRequest
- adminAuthFailure

### Main declarations

- protectedOperationalRequest
- adminAuthFailure

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/api/diagnostics/catalog.ts

### Imports

- none detected

### Exports

- DiagnosticRoute
- DIAGNOSTIC_ROUTES

### Main declarations

- DiagnosticRoute
- DIAGNOSTIC_ROUTES

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/api/diagnostics/db.ts

### Imports

- ../../env
- ../../shared

### Exports

- validIdentifier
- boundedLimit
- tableNames
- scalarCount
- databaseCounts

### Main declarations

- validIdentifier
- boundedLimit
- tableNames
- scalarCount
- databaseCounts

### SQL table references

- sqlite_master

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/api/diagnostics/routes.ts

### Imports

- ../../env
- ../../shared
- ./catalog
- ./db
- ../../scoring/weights
- ../../model/version

### Exports

- routeDiagnostics

### Main declarations

- integerParam
- routeDiagnostics

### SQL table references

- sqlite_master
- races
- runners
- expert_predictions
- agf_market_snapshots
- field_signals
- learning_snapshot_candidates
- sixfold_windows
- sixfold_coupon_snapshots
- refresh_state
- source_registry

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/api/router.ts

### Imports

- ../env
- ../shared
- ../storage/program-repository
- ../tjk/program-service
- ../experts/service
- ../history/service
- ../form/service
- ../field/service
- ../coupons/service
- ./auth
- ../observability/logger
- ./system-diagnostics

### Exports

- route

### Main declarations

- route

### SQL table references

- sixfold_windows
- sixfold_coupon_snapshots
- source_registry
- learning_model_state
- learning_runner_features
- learning_races
- learning_snapshot_candidates
- official_result_runs
- learning_advanced_metrics
- expert_learning_priors
- expert_category_priors
- learning_context_priors
- coupon_strategy_metrics
- learning_label_audit
- expert_predictions
- agf_market_snapshots
- field_signals
- runners
- races
- refresh_state
- field_refresh_state

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/api/system-diagnostics.ts

### Imports

- ../env
- ./diagnostics/routes

### Exports

- systemDiagnosticResponse

### Main declarations

- systemDiagnosticResponse

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupon/evaluation.ts

### Imports

- ../env

### Exports

- evaluateCouponStrategies

### Main declarations

- WinnerRow
- evaluateCouponStrategies

### SQL table references

- learning_races
- coupon_strategy_metrics
- learning_runner_features

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupon/strategy.ts

### Imports

- ../scoring/types

### Exports

- CouponMode
- CouponStrategy
- recommendCouponStrategy

### Main declarations

- CouponMode
- CouponStrategy
- recommendCouponStrategy

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupons/budget-policy.ts

### Imports

- ./types

### Exports

- couponBudgetPolicy

### Main declarations

- couponBudgetPolicy

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupons/optimizer.ts

### Imports

- ./types

### Exports

- CouponProfile
- CouponRunner
- CouponLegInput
- CouponLegSelection
- OptimizedSixFoldCoupon
- optimizeSixFoldCoupons

### Main declarations

- CouponProfile
- CouponRunner
- CouponLegInput
- CouponLegSelection
- OptimizedSixFoldCoupon
- PreparedRunner
- PreparedLeg
- PROFILE_FRACTIONS
- runnerProbabilities
- prepareLeg
- selectedCoverage
- survivalProbability
- ticketCost
- HalfCandidate
- enumerateHalf
- globallyOptimalCounts
- optimizeProfile
- optimizeSixFoldCoupons

### SQL table references

- becoming
- a

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupons/repository.ts

### Imports

- ../env
- ./optimizer
- ./windows

### Exports

- upsertSixFoldWindows
- persistSixFoldCoupons
- evaluatePendingSixFoldCoupons

### Main declarations

- upsertSixFoldWindows
- persistSixFoldCoupons
- PendingCoupon
- evaluatePendingSixFoldCoupons

### SQL table references

- sixfold_windows
- sixfold_coupon_snapshots
- learning_races
- SET
- learning_runner_features

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupons/service.ts

### Imports

- ../env
- ../shared
- ../storage/program-repository
- ./types
- ./optimizer
- ./windows
- ./repository

### Exports

- generateSixFoldCoupons

### Main declarations

- normalize
- displayHorseName
- generateSixFoldCoupons

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupons/types.ts

### Imports

- none detected

### Exports

- CouponBudget
- ExpansionLevel
- CouponBudgetPolicy
- CouponCostInput
- CouponCost
- SixFoldPriceOptions
- sixFoldUnitPrice
- calculateCouponCost

### Main declarations

- CouponBudget
- ExpansionLevel
- CouponBudgetPolicy
- CouponCostInput
- CouponCost
- SixFoldPriceOptions
- sixFoldUnitPrice
- calculateCouponCost

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/coupons/windows.ts

### Imports

- none detected

### Exports

- SixFoldWindow
- ExplicitSixFoldStart
- resolveSixFoldWindows

### Main declarations

- SixFoldWindow
- ExplicitSixFoldStart
- windowFromStart
- resolveSixFoldWindows

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/env.ts

### Imports

- none detected

### Exports

- Env

### Main declarations

- Env

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/aggregation-types.ts

### Imports

- none detected

### Exports

- ExpertPredictionRow
- ExpertConsensus

### Main declarations

- ExpertPredictionRow
- ExpertConsensus

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/aggregator.ts

### Imports

- ./aggregation-types
- ./source-weight
- ./signal-policy

### Exports

- aggregateExpertPredictions

### Main declarations

- round
- clamp
- aggregateExpertPredictions

### SQL table references

- one
- that

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/concurrency.ts

### Imports

- none detected

### Exports

- mapLimit

### Main declarations

- mapLimit

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/extractor.ts

### Imports

- ../env
- ../types/models
- ../shared
- ../acquisition/semantic-json
- ./schema
- ./prompt

### Exports

- ExtractedExperts
- extractExperts

### Main declarations

- ExtractedExperts
- extractExperts

### SQL table references

- meetings

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/fingerprint.ts

### Imports

- ../acquisition/http
- ../shared

### Exports

- ExpertFingerprint
- expertHttpFingerprint

### Main declarations

- ExpertFingerprint
- expertHttpFingerprint

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/persistence.ts

### Imports

- ../env
- ../types/models
- ../shared

### Exports

- persistExpertPicks

### Main declarations

- persistExpertPicks

### SQL table references

- expert_predictions
- SET

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/policy.ts

### Imports

- none detected

### Exports

- expertCheckIntervalMs

### Main declarations

- expertCheckIntervalMs

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/prompt.ts

### Imports

- none detected

### Exports

- expertExtractionPrompt

### Main declarations

- expertExtractionPrompt

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/schema.ts

### Imports

- none detected

### Exports

- expertSchema

### Main declarations

- expertSchema

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/service.ts

### Imports

- ../env
- ../shared
- ./policy
- ./fingerprint
- ./extractor
- ./validator
- ./persistence
- ./source-repository
- ./concurrency
- ./source-types

### Exports

- refreshExpertsIfDue

### Main declarations

- nextRaceMinutes
- extractionHash
- processSource
- refreshExpertsIfDue

### SQL table references

- races
- yesterday
- being
- expert_predictions
- source_registry

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/signal-policy.ts

### Imports

- ./aggregation-types

### Exports

- expertFlag
- strongestPositiveSignal

### Main declarations

- expertFlag
- strongestPositiveSignal

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/source-repository.ts

### Imports

- ../env
- ./source-types

### Exports

- activeExpertSources
- markExpertChecked
- markExpertHealthy
- markExpertFailure

### Main declarations

- activeExpertSources
- markExpertChecked
- markExpertHealthy
- markExpertFailure

### SQL table references

- source_registry

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/source-types.ts

### Imports

- none detected

### Exports

- ExpertSource
- ExpertRefreshResult

### Main declarations

- ExpertSource
- ExpertRefreshResult

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/source-weight.ts

### Imports

- ./aggregation-types

### Exports

- effectiveSourceWeight

### Main declarations

- clamp
- numeric
- effectiveSourceWeight

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/experts/validator.ts

### Imports

- ../env
- ../types/models
- ../shared

### Exports

- validateExpertPicks

### Main declarations

- validateExpertPicks

### SQL table references

- runners
- anomalies

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/acquisition.ts

### Imports

- ../env
- ../acquisition/deterministic
- ./tjk-performance-parser
- ./semantic-extractor

### Exports

- AcquiredFieldPage
- acquireTjkFieldPage

### Main declarations

- AcquiredFieldPage
- acquireTjkFieldPage

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/combined-field-score.ts

### Imports

- ../scoring/math

### Exports

- CombinedFieldScore
- combineFieldScores

### Main declarations

- CombinedFieldScore
- combineFieldScores

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/expert-field-score.ts

### Imports

- ../scoring/math

### Exports

- scoreExpertFieldComments

### Main declarations

- normalize
- trackTokens
- explicitlyRelevant
- POSITIVE
- NEGATIVE
- scoreExpertFieldComments

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/repository.ts

### Imports

- ../env
- ../shared

### Exports

- FieldRaceCandidate
- normalizedHorseName
- fieldRaceCandidates
- persistFieldRace
- markFieldRaceFailure

### Main declarations

- FieldRaceCandidate
- normalizedHorseName
- fieldRaceCandidates
- persistFieldRace
- markFieldRaceFailure

### SQL table references

- races
- field_signals
- runners
- field_refresh_state
- SET

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/semantic-extractor.ts

### Imports

- ../env
- ../acquisition/semantic-json
- ./tjk-performance-parser

### Exports

- extractTjkFieldSemantic

### Main declarations

- textOrNull
- integerOrNull
- normalizedDate
- extractTjkFieldSemantic

### SQL table references

- JSON

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/service.ts

### Imports

- ../env
- ./acquisition
- ./tjk-field-score
- ./repository

### Exports

- refreshFieldSignalsIfDue

### Main declarations

- CONCURRENCY
- BATCH_SIZE
- mapLimit
- refreshFieldSignalsIfDue

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/tjk-field-score.ts

### Imports

- ../scoring/math
- ./tjk-performance-parser

### Exports

- TjkFieldScore
- scoreTjkFieldHistory

### Main declarations

- finishScore
- RECENCY_WEIGHTS
- TjkFieldScore
- scoreTjkFieldHistory

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/field/tjk-performance-parser.ts

### Imports

- cheerio

### Exports

- TjkFieldHistoryRow
- TjkFieldPerformancePage
- parseTjkFieldPerformancePage
- validateTjkFieldPerformancePage

### Main declarations

- TjkFieldHistoryRow
- TjkFieldPerformancePage
- clean
- lower
- integer
- normalizeDate
- parseTjkFieldPerformancePage
- validateTjkFieldPerformancePage

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/acquisition.ts

### Imports

- ../env
- ./types
- ../acquisition/deterministic
- ./history-parser
- ./history-validator
- ./semantic-extractor

### Exports

- AcquiredHorseHistory
- acquireHorseHistory

### Main declarations

- AcquiredHorseHistory
- acquireHorseHistory

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/form-score.ts

### Imports

- ./types
- ../scoring/math

### Exports

- calculateForm

### Main declarations

- RECENCY_WEIGHTS
- positionScore
- formTrend
- calculateForm

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/history-parser.ts

### Imports

- cheerio
- ./types

### Exports

- parseHorseHistoryPage

### Main declarations

- clean
- lower
- numberValue
- integerValue
- normalizeDate
- headerIndexes
- parseHorseHistoryPage

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/history-validator.ts

### Imports

- ./types

### Exports

- validateHorseHistory

### Main declarations

- validateHorseHistory

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/horse-key.ts

### Imports

- none detected

### Exports

- horseKeyFromProfileUrl

### Main declarations

- horseKeyFromProfileUrl

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/recent-form-score.ts

### Imports

- ../scoring/math

### Exports

- ParsedRecentForm
- parseRecentForm
- scoreRecentForm

### Main declarations

- ParsedRecentForm
- RECENCY_WEIGHTS
- normalizePosition
- positionScore
- calculateTrend
- parseRecentForm
- scoreRecentForm

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/repository.ts

### Imports

- ../env
- ./types

### Exports

- FormCandidate
- formCandidates
- isFormFresh
- persistHorseHistory
- markFormFailure

### Main declarations

- FormCandidate
- formCandidates
- isFormFresh
- persistHorseHistory
- markFormFailure

### SQL table references

- runners
- horse_form_refresh_state
- horse_form_history
- SET

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/semantic-extractor.ts

### Imports

- ../env
- ./types
- ../acquisition/semantic-json

### Exports

- extractHorseHistorySemantic

### Main declarations

- numberOrNull
- integerOrNull
- extractHorseHistorySemantic

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/service.ts

### Imports

- ../env
- ./acquisition
- ./repository

### Exports

- refreshHorseForms

### Main declarations

- FORM_TTL_MS
- FORM_CONCURRENCY
- FORM_BATCH_SIZE
- mapLimit
- refreshHorseForms

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/form/types.ts

### Imports

- none detected

### Exports

- HorseHistoryRun
- HorseFormResult

### Main declarations

- HorseHistoryRun
- HorseFormResult

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/history/service.ts

### Imports

- ../env
- ../shared

### Exports

- finalizeStartedRaces
- cleanup
- getHistory

### Main declarations

- finalizeStartedRaces
- cleanup
- getHistory

### SQL table references

- races
- runners
- expert_predictions
- race_history
- meetings
- source_runs
- anomalies

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/index.ts

### Imports

- ./env
- ./api/router
- ./tjk/program-service
- ./experts/service
- ./history/service
- ./market/repository
- ./field/service
- ./learning/snapshot-service
- ./learning/retention
- ./results/runtime
- ./coupons/repository
- ./observability/logger

### Exports

- none detected

### Main declarations

- runScheduledPipeline

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/adjustment.ts

### Imports

- ../scoring/math
- ../scoring/types

### Exports

- ContextPrior
- GlobalOutcomeRates
- applyLearningAdjustment
- expertWeightMultiplier

### Main declarations

- ContextPrior
- GlobalOutcomeRates
- learnedSignal
- applyLearningAdjustment
- expertWeightMultiplier

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/advanced-evaluation.ts

### Imports

- ../env

### Exports

- evaluateAdvancedLearning

### Main declarations

- evaluateAdvancedLearning

### SQL table references

- learning_runner_features
- winner_ranks
- adjustment_stats
- race_eval
- learning_advanced_metrics

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/candidate-repository.ts

### Imports

- ../env

### Exports

- LearningCandidate
- upsertLearningCandidate
- deleteLearningCandidate

### Main declarations

- LearningCandidate
- upsertLearningCandidate
- deleteLearningCandidate

### SQL table references

- learning_snapshot_candidates
- SET

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/evaluation.ts

### Imports

- ../env
- ../scoring/math

### Exports

- evaluateLearningModel

### Main declarations

- EvaluationRow
- MIN_GATE_RACES
- evaluateLearningModel

### SQL table references

- learning_runner_features
- winner_ranks
- race_eval
- learning_model_state
- SET

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/expert-category.ts

### Imports

- ../env
- ../scoring/math

### Exports

- rebuildExpertCategoryPriors
- expertCategory

### Main declarations

- CategoryRow
- MIN_SAMPLES
- rebuildExpertCategoryPriors
- expertCategory

### SQL table references

- learning_expert_picks
- category_picks
- expert_category_priors

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/identity.ts

### Imports

- none detected

### Exports

- horseIdentity
- jockeyIdentity
- distanceBand

### Main declarations

- normalizedName
- numericIdFromUrl
- horseIdentity
- jockeyIdentity
- distanceBand

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/market-features.ts

### Imports

- ../env

### Exports

- LearningMarketFeatures
- loadRaceMarketFeatures

### Main declarations

- SnapshotRow
- LearningMarketFeatures
- latestAtOrBefore
- loadRaceMarketFeatures

### SQL table references

- agf_market_snapshots

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/priors.ts

### Imports

- ../env
- ./identity
- ./adjustment

### Exports

- rebuildLearningPriors

### Main declarations

- GroupRow
- globalRates
- replaceContext
- rebuildLearningPriors

### SQL table references

- learning_runner_features
- learning_context_priors
- learning_expert_picks
- expert_learning_priors
- learning_races

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/repository.ts

### Imports

- ../env

### Exports

- LearningRunnerSnapshot
- insertLearningRace
- insertLearningRunner
- attachOfficialResult
- insertLearningExpertPick

### Main declarations

- LearningRunnerSnapshot
- insertLearningRace
- insertLearningRunner
- attachOfficialResult
- insertLearningExpertPick

### SQL table references

- features
- learning_races
- training
- learning_runner_features
- learning_expert_picks

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/retention.ts

### Imports

- ../env

### Exports

- cleanupLearning

### Main declarations

- cleanupLearning

### SQL table references

- official_result_runs
- learning_snapshot_candidates

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/learning/snapshot-service.ts

### Imports

- ../env
- ../shared
- ../storage/program-repository
- ./repository
- ./candidate-repository
- ./market-features
- ../model/version

### Exports

- capturePreRaceCandidates
- promoteStartedCandidates

### Main declarations

- CandidateRow
- componentScore
- capturePreRaceCandidates
- promoteStartedCandidates

### SQL table references

- learning_snapshot_candidates
- learning_races

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/market/market-score.ts

### Imports

- ../scoring/math
- ./types

### Exports

- MarketWindowOptions
- analyzeMarketMovement
- scoreMarketMovement

### Main declarations

- MIN_SPAN_MS
- validPoint
- classifyDirection
- MarketWindowOptions
- analyzeMarketMovement
- scoreMarketMovement

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/market/refresh-policy.ts

### Imports

- ../env
- ../shared

### Exports

- AdaptiveTjkPolicy
- adaptiveTjkPolicy

### Main declarations

- AdaptiveTjkPolicy
- adaptiveTjkPolicy

### SQL table references

- meetings
- races

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/market/repository.ts

### Imports

- ../env
- ../types/models
- ./types
- ../shared

### Exports

- MarketSnapshotMap
- marketRunnerKey
- recordAgfSnapshots
- getTodayMarketSnapshots
- cleanupMarketSnapshots

### Main declarations

- MarketSnapshotMap
- marketRunnerKey
- recordAgfSnapshots
- getTodayMarketSnapshots
- cleanupMarketSnapshots

### SQL table references

- contaminating
- agf_market_snapshots

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/market/types.ts

### Imports

- none detected

### Exports

- AgfSnapshotPoint
- MarketMovement

### Main declarations

- AgfSnapshotPoint
- MarketMovement

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/model/version.ts

### Imports

- none detected

### Exports

- MODEL_VERSION
- LEARNING_POLICY_VERSION
- COUPON_POLICY_VERSION

### Main declarations

- MODEL_VERSION
- LEARNING_POLICY_VERSION
- COUPON_POLICY_VERSION

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/observability/logger.ts

### Imports

- ../env

### Exports

- LogLevel
- LogContext
- logEvent
- logger
- observed

### Main declarations

- LogLevel
- LogContext
- ORDER
- configuredLevel
- debugSampleRate
- sanitize
- shouldLog
- logEvent
- logger
- observed

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/acquisition.ts

### Imports

- ../env
- ../acquisition/deterministic
- ./parser
- ./validator
- ./semantic
- ./types

### Exports

- AcquiredOfficialResults
- acquireOfficialResults

### Main declarations

- AcquiredOfficialResults
- acquireOfficialResults

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/learning-labels.ts

### Imports

- ../env
- ./types
- ../learning/repository

### Exports

- attachMeetingResultsToLearning

### Main declarations

- normalizeHorseName
- FrozenRunner
- auditSkip
- attachMeetingResultsToLearning

### SQL table references

- learning_runner_features
- learning_label_audit

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/parser.ts

### Imports

- cheerio
- ./types

### Exports

- parseOfficialResultsHtml

### Main declarations

- clean
- normalizedHeader
- parseHorseIdentity
- findHeaderIndex
- parseOfficialResultsHtml

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/runtime.ts

### Imports

- ../env
- ./url
- ./service

### Exports

- ingestOfficialResultsDue

### Main declarations

- PendingMeeting
- RESULT_DELAY_MINUTES
- RETRY_MINUTES
- ingestOfficialResultsDue

### SQL table references

- learning_races
- official_result_runs

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/semantic.ts

### Imports

- ../env
- ../acquisition/semantic-json
- ./types

### Exports

- extractOfficialResultsSemantic

### Main declarations

- extractOfficialResultsSemantic

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/service.ts

### Imports

- ../env
- ./acquisition
- ./learning-labels
- ../learning/priors
- ../learning/evaluation
- ../learning/expert-category
- ../learning/advanced-evaluation
- ../coupon/evaluation

### Exports

- ingestOfficialResults

### Main declarations

- ingestOfficialResults

### SQL table references

- official_result_runs
- SET

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/types.ts

### Imports

- none detected

### Exports

- OfficialRunnerResult
- OfficialRaceResult
- OfficialMeetingResults

### Main declarations

- OfficialRunnerResult
- OfficialRaceResult
- OfficialMeetingResults

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/url.ts

### Imports

- none detected

### Exports

- buildOfficialResultsUrl

### Main declarations

- buildOfficialResultsUrl

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/results/validator.ts

### Imports

- ./types

### Exports

- validateOfficialResults

### Main declarations

- validateOfficialResults

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/agf-score.ts

### Imports

- ./math

### Exports

- scoreAgf

### Main declarations

- scoreAgf

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/expert-score.ts

### Imports

- ../experts/aggregation-types
- ./math

### Exports

- scoreExpert

### Main declarations

- scoreExpert

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/form-score.ts

### Imports

- ./math

### Exports

- scoreForm

### Main declarations

- scoreForm

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/horse-score.ts

### Imports

- ./types
- ./weights
- ./math
- ./agf-score
- ./hp-score
- ./weight-score
- ./expert-score
- ../form/recent-form-score

### Exports

- scoreHorse

### Main declarations

- scoreHorse

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/hp-score.ts

### Imports

- ./math

### Exports

- scoreHp

### Main declarations

- scoreHp

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/math.ts

### Imports

- none detected

### Exports

- clamp
- round
- finiteOrNull
- minMaxScore

### Main declarations

- clamp
- round
- finiteOrNull
- minMaxScore

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/race-score.ts

### Imports

- ./types
- ./math
- ./horse-score

### Exports

- scoreRace
- raceUncertainty

### Main declarations

- scoreRace
- raceUncertainty

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/types.ts

### Imports

- ../experts/aggregation-types

### Exports

- ScoringRunner
- ScoreComponent
- HorseModelScore
- ScoredRunner
- RaceUncertainty

### Main declarations

- ScoringRunner
- ScoreComponent
- HorseModelScore
- ScoredRunner
- RaceUncertainty

### SQL table references

- time

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/weight-score.ts

### Imports

- ./math

### Exports

- scoreWeight

### Main declarations

- scoreWeight

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/scoring/weights.ts

### Imports

- none detected

### Exports

- SCORING_WEIGHTS
- TOTAL_SCORING_WEIGHT

### Main declarations

- SCORING_WEIGHTS
- TOTAL_SCORING_WEIGHT

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/shared.ts

### Imports

- none detected

### Exports

- json
- errorMessage
- isoNow
- turkeyDate
- turkeyDateTime
- sha256
- unwrapQuickActionJson

### Main declarations

- json
- errorMessage
- isoNow
- turkeyDate
- turkeyDateTime
- sha256
- unwrapQuickActionJson

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/storage/program-repository.ts

### Imports

- ../env
- ../types/models
- ../shared
- ../experts/aggregator
- ../scoring/race-score
- ../market/repository
- ../market/market-score
- ../field/expert-field-score
- ../field/combined-field-score
- ../learning/identity
- ../learning/adjustment
- ../learning/expert-category
- ../coupon/strategy

### Exports

- upsertProgram
- getToday

### Main declarations

- upsertProgram
- getToday

### SQL table references

- runners
- races
- meetings
- sixfold_windows
- field_signals
- learning_runner_features
- learning_model_state
- learning_context_priors
- expert_learning_priors
- expert_category_priors
- expert_predictions
- SET
- source_registry

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/storage/state.ts

### Imports

- ../env
- ../shared

### Exports

- RefreshState
- getState
- ensureState
- acquireLease
- markSuccess
- markFailure
- isDue

### Main declarations

- RefreshState
- getState
- ensureState
- acquireLease
- markSuccess
- markFailure
- isDue

### SQL table references

- refresh_state

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/tjk/extraction-pipeline.ts

### Imports

- ../env
- ../types/models
- ./html-parser
- ./meeting-classification

### Exports

- TjkStage
- TjkDiagnostic
- TjkExtractionError
- extractTjkProgramWithFallbacks

### Main declarations

- TjkStage
- TjkDiagnostic
- TjkExtractionError
- TJK_MASTER_URL
- HTTP_TIMEOUT_MS
- BROWSER_TIMEOUT_MS
- CITY_CONCURRENCY
- BROWSER_FALLBACK_CONCURRENCY
- browserFallbackWaiters
- withBrowserFallbackSlot
- errorText
- turkeyDateParts
- buildCityUrl
- timed
- HttpHtmlResult
- httpHtml
- annotateDiagnostic
- httpDiagnosticDetail
- meetingDiagnosticDetail
- unwrapQuickAction
- recursivelyFindHtml
- scrapeHtml
- contentHtml
- normalizeJsonMeeting
- assertJsonCanonicalParity
- jsonMeeting
- meetingThroughFourStages
- meetingsFromMasterHtml
- discoverMeetings
- mapLimited
- extractTjkProgramWithFallbacks

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/tjk/html-parser.ts

### Imports

- cheerio
- ../types/models

### Exports

- TjkMeeting
- TjkRace
- TjkRunner
- TjkMeetingLink
- discoverDomesticMeetingLinks
- discoverDomesticMeetingNames
- parseTjkMeetingPage
- assertCompleteMeeting
- assertCompleteProgram

### Main declarations

- TjkMeeting
- TjkRace
- TjkRunner
- DOMESTIC_MEETING_RE
- RACE_HEADER_RE
- clean
- lower
- parseNumber
- parseInteger
- parseAgf
- anchorHref
- anchorText
- TjkMeetingLink
- discoverDomesticMeetingLinks
- discoverDomesticMeetingNames
- headerIndexes
- parseRunnerTable
- parseRaceHeader
- directText
- parseSixFoldStartNumbers
- parseSurface
- parseTjkMeetingPage
- assertCompleteMeeting
- assertCompleteProgram

### SQL table references

- rendered
- duplicating
- this

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/tjk/meeting-classification.ts

### Imports

- ../types/models

### Exports

- MeetingLike
- isCompositeTjkMeetingName
- filterCanonicalTjkMeetings
- assertCanonicalTjkProgram

### Main declarations

- MeetingLike
- normalizeMeetingName
- isCompositeTjkMeetingName
- filterCanonicalTjkMeetings
- assertCanonicalTjkProgram

### SQL table references

- real

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/tjk/program-service.ts

### Imports

- ../env
- ../shared
- ../storage/state
- ../storage/program-repository
- ../market/repository
- ../market/refresh-policy
- ./meeting-classification
- ./registry
- ./extraction-pipeline

### Exports

- refreshProgramIfDue

### Main declarations

- KEY
- summarizeTjkDiagnostics
- refreshProgramIfDue

### SQL table references

- meetings
- a

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/tjk/registry.ts

### Imports

- ../env
- ../shared

### Exports

- getTjkProgramUrl
- rediscoverTjkProgramUrl

### Main declarations

- FALLBACK
- validProgramPage
- getTjkProgramUrl
- rediscoverTjkProgramUrl

### SQL table references

- main_source_registry

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/tjk/schema.ts

### Imports

- none detected

### Exports

- tjkMeetingJsonSchema
- tjkProgramSchema

### Main declarations

- tjkMeetingJsonSchema
- tjkProgramSchema

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?

## src/types/models.ts

### Imports

- none detected

### Exports

- RunnerInput
- RaceInput
- MeetingInput
- TjkProgramInput
- ExpertPickInput
- ExpertExtractionInput

### Main declarations

- RunnerInput
- RaceInput
- MeetingInput
- TjkProgramInput
- ExpertPickInput
- ExpertExtractionInput

### SQL table references

- none detected

### Bu dosyayı okurken sor

- Caller kim?
- Callee kim?
- API mi, service mi, repository mi, parser mı, scorer mı, optimizer mı?
- Hangi invariantı koruyor?
- Hangi DB state'e dokunuyor?
- Hangi external source'a bağımlı?
- Fail olursa downstream'de ne bozulur?
- Hangi /api/debug endpoint bunu gözleyebilir?


---

# PART B — DATABASE TABLE ATLAS

Bir table yalnız SQL storage değildir.

Her table için şu modeli düşün:

WRITER
→ IDENTITY
→ LIFECYCLE
→ READERS
→ FRESHNESS
→ DIAGNOSTICS
→ DOWNSTREAM EFFECT

## agf_market_snapshots


Time-series AGF market snapshots.

Key concept:
captured_at

Bir horse için multiple rows beklenir.

Used for:
current market state
market movement
trend.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## anomalies


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## coupon_strategy_metrics


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## expert_category_priors


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## expert_learning_priors


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## expert_predictions


Normalized source-level expert predictions.

Conceptual identity:
date + city + race + horse + source

Used by:
expert consensus.

Empty data tek başına parser bug anlamına gelmez.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## field_refresh_state


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## field_signals


Runner-level field/context signals.

Signal row bulunması ile model score üretilebilmesi farklı şeylerdir.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## horse_form_history


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## horse_form_refresh_state


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## horse_learning_priors


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## jockey_learning_priors


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_advanced_metrics


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_context_priors


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_expert_picks


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_label_audit


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_model_state


Learning evaluation ve production gate state.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_races


Learning lifecycle'a promote edilmiş race-level records.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_runner_features


Frozen runner features ve daha sonra bağlanan labels.

Official result prediction feature olmamalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## learning_snapshot_candidates


Pre-race candidate evidence.

Critical invariant:

captured_at < starts_at

Bu invariant bozulursa historical evaluation güvenilir değildir.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## main_source_registry


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## meetings


Canonical meeting/city root.

Writer:
TJK program persistence.

Role:
Bir race date içindeki meeting identity.

Downstream:
Meeting kaybolursa ilgili şehir tüm pipeline'dan düşebilir.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## official_result_runs


Official result ingestion runtime/audit state.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## race_history


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## races


Canonical race table.

Critical identity:
race_date + city + race_number

Critical timing:
starts_at

Readers:
API
learning
six-fold
history
scoring context

starts_at temporal correctness için kritik alandır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## refresh_state


Pipeline freshness state.

Operational debugging için çok önemlidir.

Son attempt/success ve pipeline freshness burada izlenebilir.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## runners


Canonical horse/runner table.

Identity:
race_date + city + race_number + horse_number

Readers:
scoring
expert mapping
market mapping
field mapping
API
coupon generation

Runner yoksa downstream signal mapping güvenilir değildir.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## sixfold_coupon_snapshots


Frozen coupon prediction snapshots.

Used for:

historical evaluation
idempotency
hit-leg evaluation
5/6
6/6

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## sixfold_windows


Altılı window metadata.

Identity:

race_date
city
sixfold_number

Carries:

start_race
end_race
source
updated_at

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## source_registry


External source registry.

Carries:
source identity
enabled state
health state

Used for:
expert pipeline
diagnostics
degradation handling.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?

## source_runs


Migrationlarda bulunan D1 table.

Semantic ownership source code ve repository kullanımıyla birlikte okunmalıdır.

### Diagnostic checklist

- Writer kim?
- Reader kim?
- Row identity nedir?
- Unique constraint var mı?
- Row count beklenen mi?
- Latest timestamp fresh mi?
- Rebuildable mı?
- Historical truth mü?
- Cache mi?
- Stale olursa ne bozulur?
- Hangi diagnostic endpoint bunu gözler?


---

# PART C — MIGRATION HISTORY

Migration'lar yalnız setup dosyası değildir.

Production schema'nın tarihidir.

Schema problemi araştırılırken:

LOCAL MIGRATION
→ GITHUB MAIN
→ CI MIGRATION
→ PRODUCTION SQLITE_MASTER

birbiriyle karşılaştırılmalıdır.

## 0001_initial.sql

Tables created/detected: source_registry, source_runs, anomalies

Runtime schema verification endpoint: /api/debug/db/schema

## 0002_main_source_registry.sql

Tables created/detected: main_source_registry

Runtime schema verification endpoint: /api/debug/db/schema

## 0003_runtime_architecture.sql

Tables created/detected: refresh_state, meetings, races, runners, expert_predictions, race_history

Runtime schema verification endpoint: /api/debug/db/schema

## 0004_expert_source_taxonomy.sql

Tables created/detected: none

Runtime schema verification endpoint: /api/debug/db/schema

## 0005_runner_form_history.sql

Tables created/detected: horse_form_history

Runtime schema verification endpoint: /api/debug/db/schema

## 0006_horse_form_refresh_state.sql

Tables created/detected: horse_form_refresh_state

Runtime schema verification endpoint: /api/debug/db/schema

## 0007_tjk_recent_form.sql

Tables created/detected: none

Runtime schema verification endpoint: /api/debug/db/schema

## 0008_agf_market_snapshots.sql

Tables created/detected: agf_market_snapshots

Runtime schema verification endpoint: /api/debug/db/schema

## 0009_remove_karma_from_canonical_program.sql

Tables created/detected: none

Runtime schema verification endpoint: /api/debug/db/schema

## 0010_field_signals.sql

Tables created/detected: field_signals, field_refresh_state

Runtime schema verification endpoint: /api/debug/db/schema

## 0011_learning_system.sql

Tables created/detected: learning_races, learning_runner_features, official_result_runs, horse_learning_priors, jockey_learning_priors, expert_learning_priors

Runtime schema verification endpoint: /api/debug/db/schema

## 0012_learning_snapshot_candidates.sql

Tables created/detected: learning_snapshot_candidates

Runtime schema verification endpoint: /api/debug/db/schema

## 0013_learning_calibration.sql

Tables created/detected: learning_expert_picks, learning_context_priors

Runtime schema verification endpoint: /api/debug/db/schema

## 0014_learning_score_provenance.sql

Tables created/detected: none

Runtime schema verification endpoint: /api/debug/db/schema

## 0015_learning_evaluation_gate.sql

Tables created/detected: learning_model_state

Runtime schema verification endpoint: /api/debug/db/schema

## 0016_advanced_learning.sql

Tables created/detected: expert_category_priors, learning_advanced_metrics

Runtime schema verification endpoint: /api/debug/db/schema

## 0016_sixfold_coupon_tracking.sql

Tables created/detected: sixfold_windows, sixfold_coupon_snapshots

Runtime schema verification endpoint: /api/debug/db/schema

## 0017_coupon_evaluation_and_audit.sql

Tables created/detected: coupon_strategy_metrics, learning_label_audit

Runtime schema verification endpoint: /api/debug/db/schema

## 0017_sixfold_snapshot_idempotency.sql

Tables created/detected: none

Runtime schema verification endpoint: /api/debug/db/schema

## 0018_shadow_learning_gate.sql

Tables created/detected: none

Runtime schema verification endpoint: /api/debug/db/schema

## 0019_tjk_sixfold_metadata.sql

Tables created/detected: none

Runtime schema verification endpoint: /api/debug/db/schema


---

# PART D — CROSS-LAYER IMPACT MAP

## TJK parser değişirse

TJK fetch
→ parse
→ races
→ runners
→ enrichment mapping
→ scoring
→ coupon
→ learning snapshots

etkilenebilir.

## Runner identity değişirse

experts
market
field
form
learning
coupon

matching etkilenebilir.

## Scoring değişirse

ranking
probabilities
coupon selection
historical model comparison

etkilenebilir.

## Coupon optimizer değişirse

runner scores aynı kalabilir fakat:

selected horses
combination count
totalTL
coverage probability

değişebilir.

## Learning timing değişirse

historical validity
evaluation
production gate

etkilenebilir.

## DB schema değişirse

migration
repository
diagnostics
tests
deployment

birlikte değerlendirilmelidir.

---

# PART E — ROOT CAUSE LOOKUP

Canonical card yanlış:
- src/tjk
- src/storage
- refresh_state
- /api/debug/card

Runner eksik:
- races
- runners
- TJK parser
- /api/debug/race

Expert eksik:
- source_registry
- expert_predictions
- src/experts
- /api/debug/sources
- /api/debug/runner

Market eksik:
- agf_market_snapshots
- src/market
- /api/debug/data-quality

Field eksik:
- field_signals
- src/field
- /api/debug/runner

Score yanlış:
- src/scoring
- /api/debug/scoring-config
- /api/debug/runner

Coupon yanlış:
- src/coupons
- sixfold_windows
- sixfold_coupon_snapshots
- /api/debug/sixfold

Learning yanlış:
- learning_snapshot_candidates
- learning_races
- learning_runner_features
- /api/debug/invariants
- /api/debug/learning-pipeline
