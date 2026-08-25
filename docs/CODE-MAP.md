# Two Horse Code Map

| Area | Primary responsibility |
|---|---|
| src/api | HTTP routing, auth boundary, diagnostics |
| src/api/diagnostics | Small operational probes |
| src/tjk | TJK ingestion and canonical program refresh |
| src/storage | Persistence and repositories |
| src/experts/discovery.ts | Current expert article discovery |
| src/experts/extractor.ts | Article semantic extraction orchestration |
| src/experts/raw-extraction.ts | Compact AI contract and deterministic domain mapping |
| src/experts/validator.ts | Official TJK expert-runner validation |
| src/experts/fingerprint.ts | AI-free expert content change detection |
| src/experts/source-urls.ts | Durable expert entry URL routing |
| src/experts/service.ts | Refresh, cache, discovery, extraction and persistence lifecycle |
| src/form | Horse-form enrichment |
| src/field | Field and contextual signals |
| src/scoring | Feature weighting and scoring |
| src/model | Model and policy versions |
| src/coupons | Coupon generation and optimization |
| src/history | Historical snapshots and results |
| src/observability | Structured operational logging |
| tests | Behavioral and invariant protection |
| docs | Architecture and operational knowledge |

## Expert dependency direction

service

down to:

discovery

then:

current article URL

then:

extractor

then:

raw-extraction

then:

validator plus official TJK D1

then:

persistence

then:

consensus and scoring

Discovery owns URL selection.

Extraction owns source semantics.

TJK validation owns runner identity.

Persistence receives only canonical expert picks.

## Investigation principle

Dosya adı değil responsibility takip edilir.

Bir bug birden fazla katmanda symptom üretebilir.

Root cause mümkün olduğunca tek owning subsystem'e atanmalıdır.

Downstream scoring değiştirilmeden önce upstream discovery, extraction and
canonical validation evidence doğrulanmalıdır.


### Expert configuration and resilient acquisition

`config/expert-acquisition.json`
contains source URLs, hosts, publishing modes, navigation recovery labels,
excluded utility paths, acquisition order, scoring hints and extraction
thresholds.

`src/config/expert-acquisition.ts`
is the typed and fail-closed config adapter.

`src/experts/date-evidence.ts`
generates Turkish date evidence using Intl rather than manual month tables.

`src/experts/acquisition-fallback.ts`
owns shared SCRAPE/CONTENT/HTTP acquisition behavior.

`src/experts/discovery.ts`
contains generic real-link discovery and navigation recovery.

`src/experts/source-resolver.ts`
resolves current article bundles or direct current pages.

`src/experts/extractor.ts`
owns preflight, source-aware compaction and Workers AI extraction.

`src/experts/service.ts`
owns production gates and complete bundle persistence.

`src/experts/preview.ts`
runs the same path read-only.
