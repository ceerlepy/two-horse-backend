# Two Horse Refresh and Retention Policy

## Purpose

Two Horse separates canonical race data, expert commentary, market data,
history and learning into independent refresh responsibilities.

A cron wake-up does not imply every upstream source should be called.

Policy gates decide whether upstream work is useful before network,
Browser Run or Workers AI resources are spent.

## TJK canonical program

TJK is the canonical race-program authority.

Validated D1 data remains the source of truth for application reads.

A failed upstream refresh must never destroy the last validated canonical
snapshot.

Program acquisition, parsing and validation remain independent from the
expert/comment pipeline.

## Expert and comment sources

Expert acquisition exists only for upcoming pre-race decisions.

Refresh cadence is a tier table (`EXPERT_CHECK_CADENCE_TIERS` in
`src/experts/policy.ts`), nearest-tier-first, not a fixed interval:

- more than 120 minutes before the next race: every 6 hours;
- 60 through 120 minutes: every 15 minutes;
- 30 through 60 minutes: every 10 minutes;
- 0 through 30 minutes: every 5 minutes;
- no upcoming race: STOP.

Both Browser Rendering and Workers AI are billed per use, and nothing
about a source's published content changes meaningfully in 15 minutes
hours before a card starts, so the far tier is deliberately sparse. It
is 6 hours rather than "twice a day" because the interval is measured
as elapsed-time-since-last-check on a 5-minute cron, which has no
wall-clock awareness — a fixed interval is what that model can enforce
cleanly. 6 hours still gives several checks across a full racing day,
so a source that publishes its card late morning isn't undiscovered
until the tighter tiers kick in 2 hours before the first race.

When no upcoming canonical race exists, expert acquisition performs no
Browser Run work and no Workers AI semantic work.

A source with repeated failures gets its own additional backoff
(`expertFailureBackoffMs`: 15/30/60 minutes, capped shorter near race
time) on top of this table, so one broken source doesn't retry every
cron tick regardless of the shared cadence.

The Worker cron may still execute unrelated results, history, learning
or cleanup responsibilities.

## Discovery policy

Discovery answers only one question:

Which URL contains the current expert content?

Primary discovery is:

landing URL
-> Cloudflare SCRAPE anchor href and text
-> deterministic candidate set
-> JSON AI candidate selection
-> verified article URL

The AI may only select URLs that actually exist in the candidate set.

Once one or more valid current article URLs are selected, discovery stops.

Discovery fallback is conditional.

CONTENT-based candidate discovery or full-page semantic discovery is
allowed only when the previous discovery stage failed to select a
current article.

A successful discovery is never followed by additional discovery merely
because later extraction was empty.

## Extraction policy

Extraction answers:

What expert runner selections does the already-selected current URL
actually contain?

The authoritative production extraction path is:

accepted article/current page
-> Cloudflare rendered CONTENT
-> editorial-text normalization
-> direct Workers AI JSON Mode
-> grouped race-level structured output
-> deterministic horse-level expansion
-> source-aware completeness guard where defined
-> TJK canonical validation
-> persistence

Normal extraction uses one Workers AI semantic call.

The Workers AI request has a 4096 output-token ceiling, but usage and
billing follow actual generated work rather than the maximum ceiling.

CONTENT acquisition is a rendered-page acquisition operation.

Workers AI is the semantic interpretation operation.

These responsibilities remain separate.

A syntactically valid semantic result is not automatically considered
complete.

If a source has a verified editorial invariant, the Worker may reject a
partial semantic result before persistence.

Liderform's verified invariant is:

every real returned race-analysis paragraph must contain its explicit
main selection in selections[].

A race containing rivals while omitting its explicit main horse is
therefore incomplete rather than successful.

## Raw semantic contract

The AI transport is grouped by race.

Each race contains:

- city;
- raceNumber;
- selections[];
- numberGroups[].

selections[] contains explicitly named or commented individual expert
horses.

numberGroups[] contains compact number-only source lists.

For example:

Rakipler: 6-1-8

may be transported as one rival group containing [6,1,8].

This grouping exists only to reduce semantic output size.

Application code expands it into three separate horse-level domain rows
before canonical validation and persistence.

Allowed semantic labels are:

- favorite;
- banko;
- strong;
- star;
- rival;
- surprise;
- avoid.

Main positive commentary does not automatically become favorite or banko.

Explicit banko/tek language maps to banko.

Explicit favori/en şanslı-equivalent language maps to favorite.

A positive principal selection with no more specific source label maps to
strong.

Examples include:

- kazanmaya yakındır;
- birincilikle tanışabilir;
- önde gelen isimdir;
- ilk şansa sahiptir;
- rakiplerini geride bırakabilir;
- farklı sonuç elde edebilecek güçtedir.

The Worker deterministically converts raw labels to internal boolean
fields.

sourceRank is not inferred from ordinary prose.

Extraction confidence is source-reading confidence and is not winning
probability.

## Coupon exclusion

Expert articles may contain race-analysis prose and six-fold coupon
sections on the same page.

A race-analysis example is:

5.Koşu; (1) HORSE NAME ... strong positive analysis.

A related rival sentence may be:

Rakipler: 2-3-6.

These are expert signals.

The following coupon syntax is not runner extraction:

ALTILI GANYAN TAHMİNİMİZ

1.Ayak: 5.6.1.4
2.Ayak: 4.2.3.1.7

An Altılı leg number is not automatically a race number.

Numbers inside an Altılı leg are not automatically expert prediction
rows.

## TJK validation

External expert sources never own canonical runner identity.

Canonical identity is:

Turkey race date
+ city
+ race number
+ horse number

If a source explicitly supplies a horse name, the supplied name must
identify the same TJK canonical runner.

A conflicting supplied horse name is rejected and recorded as an
anomaly.

If a legitimate source supplies only rival numbers, such as:

Rakipler: 2-3-6

horseName may be null during raw extraction.

Only after city, race and horse number identify an official TJK runner
may the Worker attach the canonical TJK horse name.

## Read-only expert extraction preview

The administrative extraction preview exists for production diagnostics.

Endpoint:

POST /api/admin/preview-expert-source?source=<source_key>

It intentionally calls the real acquisition and semantic extraction path
without using the scheduled refresh decision.

This allows a completed day's article to be tested even after the normal
expert subsystem has correctly entered SKIPPED_NO_UPCOMING_RACE.

The preview is not a persistence bypass.

It must not:

- write expert_predictions;
- update source health;
- update last_working_url;
- update refresh trace;
- weaken the scheduled no-upcoming-race gate.

Its purpose is to answer one narrow diagnostic question:

What would the current production extractor return for this known article
right now?

The 24 August 2026 Liderform verification returned:

6 races
6 main selections
6 strong signals
18 rivals
24 total horse-level picks
0 missing main selections

with completeness.complete=true.

This preview proved the corrected semantic path without modifying the
existing day's persisted rows.

## Cache policy

The cache distinguishes a dynamically discovered daily article from a
durable landing or current page.

### Daily article

During the same Turkey date, a previously verified article may be
reused.

Before repeat semantic extraction, an ordinary HTTP fingerprint is
computed.

If normalized content is unchanged and current-date prediction rows
already exist:

AI calls = 0.

On a new Turkey date, a previous daily article is not sent to AI merely
to prove that it is yesterday's article.

It is skipped and the system proceeds directly to current discovery.

### Stable or current page

Some sources keep one prediction URL while changing the page contents.

Those configured landing/current URLs may remain eligible across dates.

They are first checked using an AI-free HTTP fingerprint.

If unchanged content cannot contain a new current card, repeated
semantic extraction is skipped.

If content changed, semantic extraction is justified.

## Fingerprint policy

Raw HTML is not a reliable semantic cache key because analytics scripts,
tracking values, random identifiers and markup can change independently
of editorial content.

Daily articles fingerprint normalized visible text.

Stable landing/current pages fingerprint:

normalized visible text
+ normalized anchor text and destination href

Landing href destinations are preserved because a page may keep the same
visible label while linking to a new daily article.

Fingerprinting uses ordinary HTTP.

It consumes no Browser Run semantic AI and no Workers AI neurons.

Fingerprint failure is an optimization failure, not a correctness
failure.

## Provenance

Durable source provenance is written only after current TJK canonical
predictions are successfully persisted.

last_working_url means:

the URL that produced verified current-card expert predictions.

last_discovered_from_url means:

the landing or index URL from which that successful article was found.

last_discovery_method means:

the actual successful discovery path.

last_extraction_method means:

the extraction method that produced the verified picks.

A cache hit is reuse, not discovery, and does not overwrite the original
discovery provenance.

A SEMANTIC_EMPTY attempt does not replace verified success provenance.

## Operational outcomes

SEMANTIC_EMPTY means:

the semantic endpoint returned a valid extraction structure but no
usable picks.

NO_CANONICAL_MATCH means:

raw picks existed but none survived official TJK runner validation.

EXTRACTION_FAILED means:

a technical acquisition or semantic operation failed before a valid
semantic result existed.

NO_CURRENT_CARD is the terminal source result when appropriate candidates
were evaluated without producing current canonical predictions.

The trace includes a more specific terminal reason.

SUCCESS means:

one or more current predictions survived TJK validation and were
persisted.

## Cost invariant

For a normal newly published daily article, the expected semantic path is:

AI call 1:
candidate article selection.

AI call 2:
article expert extraction.

Same-day unchanged cache:

AI calls = 0.

No upcoming race:

AI calls = 0.

A semantic-empty extraction does not automatically multiply AI calls.

Fallbacks exist for exceptional correctness recovery rather than normal
execution.

## Retention

Operational race and expert rows retain the application's configured
short operational window.

Finalized historical snapshots remain immutable according to the history
lifecycle.

Source registry state is durable.

Diagnostic and anomaly retention follows the existing operational
cleanup policy.

## Workers AI extraction implementation

The production expert extraction path no longer relies on Browser `/json`
for full article structured output.

A production incident on 24 August 2026 demonstrated that Browser `/json`
could semantically identify correct runners while the generated JSON was
terminated before completion. The observed raw response ended inside a
JSON string and produced HTTP 422.

Current extraction is:

article URL
-> rendered CONTENT
-> normalized editorial text
-> direct Workers AI JSON Mode
-> grouped RawExpertExtraction
-> deterministic horse-level expansion
-> TJK canonical validation
-> persistence

The Workers AI request uses an output ceiling of 4096 tokens. The ceiling
is not a fixed billed amount; actual inference usage is recorded in
extraction diagnostics.

The raw semantic model is grouped by race to avoid repeating city and race
identity for every runner.

Number-only source lists are compressed during semantic transport.

For example:

Rakipler: 6-1-8

may be transported as one `rival` number group containing 6, 1 and 8.

Application code immediately expands that group back into three separate
horse-level expert selections before canonical validation.

No scoring or persistence layer sees a grouped horse identity.

## Discovery versus working provenance

`last_discovered_article_url` means the latest article URL accepted by
source-aware discovery.

It may be written even when later extraction fails.

`last_discovered_from_url` is the landing/index URL from which that article
was discovered.

`last_discovery_method` records the discovery acquisition path.

`last_working_url` is stronger evidence and is written only after the URL
produces current TJK-canonical picks that are successfully persisted.

Therefore:

discovery success != working success.

## Article-required sources

Liderform currently has a verified distinct daily-article publishing
contract.

Its preferred discovery landing is:

https://liderform.com.tr/haberler/analizler

Accepted discovered article URLs must belong to the Liderform `/haberler/`
detail family and end in `.html`.

Utility routes such as `/kayitlar`, `/program`, `/sonuclar`,
`/muhtemeller` and `/istatistik` are deterministic non-article candidates.

If Liderform discovery completes successfully but no current valid article
is available, the terminal source state is `ARTICLE_NOT_PUBLISHED`.

The pipeline does not substitute a homepage or index extraction.

## Failure budget

Repeated technical source failures use bounded per-source backoff.

Explicit admin force refresh bypasses failure backoff while a race is
upcoming.

No admin or scheduled expert refresh bypasses the no-upcoming-race gate.
