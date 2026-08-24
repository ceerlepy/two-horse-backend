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

Refresh cadence is:

- more than 120 minutes before the next race: every 15 minutes;
- 30 through 120 minutes: every 10 minutes;
- 0 through 30 minutes: every 5 minutes;
- no upcoming race: STOP.

When no upcoming canonical race exists, expert acquisition performs no
Browser Run work and no Workers AI semantic work.

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

Extraction answers a different question:

What expert runner selections does this already-selected URL contain?

Normal extraction is:

article or current-page URL
-> JSON(url)
-> compact RawExpertExtraction

This is one ordinary semantic AI call.

A technically valid result containing picks=[] is SEMANTIC_EMPTY.

SEMANTIC_EMPTY does not trigger SCRAPE plus JSON or CONTENT plus JSON
retries.

Only a real technical failure of JSON(url) may use the emergency path:

CONTENT(url)
-> rendered HTML
-> JSON(html)

CONTENT acquisition itself is Browser Run rendering, not Workers AI
semantic extraction.

The current Cloudflare Workers Binding returns CONTENT inside a JSON
envelope result field, which must be unwrapped before the rendered HTML
is passed downstream.

## Raw semantic contract

The AI is not responsible for producing Two Horse's complete internal
domain model.

It extracts only:

- city;
- raceNumber;
- horseNumber;
- horseName or null;
- comment or null;
- semantic labels.

Allowed labels are:

- favorite;
- banko;
- strong;
- star;
- rival;
- surprise;
- avoid.

The Worker deterministically converts those labels into the domain
boolean fields.

sourceRank is not inferred from ordinary prose.

Extraction confidence is assigned deterministically by application code
from source evidence. It is not a winning probability.

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
