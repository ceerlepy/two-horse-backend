# Expert Source Configuration

## Purpose

Expert-source policy is declarative.

Business logic must not contain source URL tables, utility-path denylists,
Turkish month-name tables, navigation-label sets or source path scoring
tables.

Those values live in:

`config/expert-acquisition.json`

Typed access lives in:

`src/config/expert-acquisition.ts`

## Design rule

Code owns behavior.

Configuration owns source-specific policy and operational data.

## Configured source fields

Each source declares:

- canonical host
- publishing mode
- verified entry URLs
- whether root itself is editorial
- root-navigation recovery labels
- prompt profile
- whether extraction preflight requires a target-city match
- context boost terms
- preferred article-path scoring rules

Preferred path rules are ranking hints.

They are not permanent hard contracts.

A future article prefix may change and still be accepted when:

- the URL is on the configured source host
- it exists in real acquired HTML
- local date/city/prediction evidence is plausible
- body acquisition succeeds
- expert-content preflight succeeds
- Workers AI extraction succeeds
- TJK canonical validation succeeds

## Discovery policy

Acquisition order is configured as:

SCRAPE
-> CONTENT
-> HTTP

The exact order lives in JSON.

Discovery never asks a full-page semantic model to invent a URL.

The model receives only real candidate URLs extracted from acquired source
HTML.

## Root recovery

Verified entry URL is the fast path.

If it moves:

root
-> acquire HTML
-> find configured navigation labels
-> recovered landing URL
-> normal discovery

If the navigation label also changes, article sources may still perform
strictly filtered root candidate recovery based on real href, date, city
and prediction evidence.

Direct-page sources never substitute arbitrary root text as prediction
content. Root is navigation recovery only.

## Excluded paths

Utility-path prefixes such as `/login`, `/program`, `/sonuclar` and
`/istatistik` are configuration data.

They are not hard-coded in source-policy implementation.

## Turkish dates

Month names are not maintained manually.

`src/experts/date-evidence.ts` uses:

`Intl.DateTimeFormat("tr-TR")`

with `Europe/Istanbul`.

This avoids a duplicated January-to-December lookup table.

## Extraction

Resolved target acquisition uses the same configured fallback order:

SCRAPE
-> CONTENT
-> HTTP

A response must pass content preflight before Workers AI runs.

Thresholds and relevance terms are configured.

## Persistence

Multi-document sources are fail closed.

All current documents must complete extraction and canonical validation
before source/day data is replaced.

The final replacement is executed through one D1 batch.

Existing good rows remain untouched when the new bundle is partial or
invalid.

## Preview

`POST /api/admin/preview-expert-source`

uses the same resolver, extraction and TJK validation path.

It does not persist predictions or write anomalies.

Historical regression:

`POST /api/admin/preview-expert-source?source=<source>&date=YYYY-MM-DD`
## Discovery stage configuration v5

`config/expert-acquisition.json` declares the structural discovery order.

Current order:

`cf-scrape`
`cf-links`
`cf-content`
`http`

`cf-links` is a discovery-only stage.

It is never used for article text extraction.

Extraction keeps its independent HTML acquisition order:

`cf-scrape`
`cf-content`
`http`

The distinction is represented by separate TypeScript types:
`ExpertDiscoveryStage` and `ExpertHtmlAcquisitionStage`.

Final article selection is not configuration scoring.

Configuration supplies evidence and exclusions; Workers AI makes the final
choice among real hard-filtered candidate URLs.
