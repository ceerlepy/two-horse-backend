# Two Horse Expert Acquisition Architecture

## A Production Architecture for Correctness, Cost Control and Explainability

### 1. Introduction

Expert commentary is fundamentally different from canonical race data.

TJK publishes the identity and structure of the race program.

Expert sites publish opinions about that program.

Two Horse therefore treats expert ingestion as an evidence pipeline,
not as an authority pipeline.

The architecture has three hard boundaries:

Discovery determines where current commentary lives.

Extraction determines what that commentary says.

Canonical validation determines whether the extracted runner identity
actually exists in today's official TJK program.

Keeping these responsibilities separate is the main architectural rule.

### 2. Why one generic scraper is insufficient

Expert sites use different publishing models.

A site may create a new article URL every day.

Another site may keep one permanent prediction page and replace its
contents.

A page may be server rendered.

Another may require JavaScript.

An article may contain both prose analysis and coupon construction.

Those coupon blocks contain numbers that look like race numbers and horse
numbers even though they have a different semantic meaning.

A correct system therefore needs explicit stages rather than one large
heuristic extraction operation.

### 3. Stage one: current content discovery

Discovery answers:

Where is today's relevant expert content?

The preferred flow is:

verified landing or index URL
-> Browser Run SCRAPE of real anchor elements
-> href and anchor-text candidate set
-> semantic candidate selection
-> current article URL

The deterministic candidate set is an important security and correctness
boundary.

The model is not asked to invent or guess an article URL.

Every returned article URL must be a literal member of the real DOM
candidate set.

If the semantic selector returns a verified current article, discovery
ends immediately.

There is no reason to continue with another discovery mechanism.

### 4. Discovery fallbacks

Fallbacks are conditional rather than cumulative.

If SCRAPE cannot produce usable candidates, or candidate AI cannot select
a current article, rendered CONTENT may be used to obtain another
candidate representation.

Only if candidate-based discovery remains unsuccessful may the system use
the full-page semantic safety net.

This creates the following rule:

success at discovery stage N
-> stop discovery

failure at discovery stage N
-> attempt discovery stage N+1

The system never executes every fallback simply because the fallback
exists.

### 5. Stage two: article extraction

After discovery, the current article URL is already known.

The extraction question is deliberately narrower:

Which horses does the article explicitly recommend, oppose or identify
as rivals, and what semantic role does each signal have?

The authoritative production path is:

accepted article/current page
-> Cloudflare rendered CONTENT
-> editorial-text normalization
-> direct Workers AI JSON Mode
-> grouped race-level RawExpertExtraction
-> deterministic TypeScript expansion
-> source-aware completeness validation where applicable
-> TJK canonical runner validation
-> persistence

Normal semantic extraction uses exactly one Workers AI call.

The configured output ceiling is 4096 tokens.

That value is a maximum, not a fixed generation size or fixed billing
amount.

Actual Workers AI usage is captured from runtime diagnostics.

The 24 August 2026 Liderform production preview demonstrated this
directly:

prompt tokens: 2718
completion tokens: 489
total tokens: 3207

The article was not truncated and the semantic result was complete.

### 6. Semantic empty, incomplete and technical failure are different states

The pipeline distinguishes three fundamentally different outcomes.

SEMANTIC_EMPTY means the semantic endpoint returned a valid structured
response but no current expert selections.

INCOMPLETE means structured output exists, but a source-specific
correctness invariant proves that part of the source analysis was lost.

A technical failure means acquisition, Workers AI transport, JSON
decoding or another execution dependency failed.

These states must not be collapsed.

In particular, syntactically valid JSON is not sufficient evidence of a
complete extraction.

For a source with a verified editorial structure, the Worker may apply a
deterministic completeness oracle after semantic extraction.

The oracle does not replace AI interpretation.

It only checks whether required source evidence survived the semantic
transport.

For Liderform's verified "Koşuların analizi" article format, every real
analysis paragraph contains an explicit main horse.

Therefore:

race discovered
+ rivals extracted
+ main selection missing
= incomplete extraction

and must never silently become a valid persisted result.

### 7. Cloudflare CONTENT response handling

Cloudflare Browser Run Workers Bindings return Quick Action data through
a response envelope.

For CONTENT, rendered HTML belongs to the result field.

The application must parse the JSON response, unwrap result, verify that
the result is HTML text and only then pass it to downstream processing.

Treating the entire JSON envelope as if it were HTML corrupts the
extraction input.

### 8. Compact grouped semantic contract

The semantic model reads source meaning.

It does not produce the complete Two Horse persistence model.

The raw transport is grouped by race to reduce repetitive output tokens.

Each raw race contains:

city
raceNumber
selections[]
numberGroups[]

selections[] contains named or explicitly commented individual horses.

Each selection contains:

horseNumber
horseName when present
comment when present
labels[]

numberGroups[] represents compact source lists such as:

Rakipler: 6-1-8

with:

label = rival
horseNumbers = [6,1,8]

Grouping exists only at the AI transport boundary.

It is never the persistence identity.

TypeScript deterministically expands the example above into three
independent horse-level picks before TJK validation.

The final database continues to store individual canonical runners.

The allowed semantic vocabulary is:

favorite
banko
strong
star
rival
surprise
avoid

Application code deterministically converts these labels into internal
boolean fields.

sourceRank is not generated from ordinary prose.

Extraction confidence is also assigned by application code and represents
source-reading certainty, not winning probability.

### 9. Natural Turkish expert language

Expert writers do not use one standardized taxonomy.

The semantic extractor therefore classifies meaning rather than requiring
literal label words.

An explicit banko or tek maps to banko.

An explicit favori, en şanslı or equivalent favorite language maps to
favorite.

A positive main selection that is not explicitly banko, favorite, star,
surprise or avoid maps to strong.

Examples of strong main-selection language include:

kazanmaya yakındır

birincilikle tanışabilir

önde gelen isimdir

ilk şansa sahiptir

rakiplerini geride bırakabilir

farklı sonuç elde edebilecek güçtedir

kazanmasını bekliyoruz

rövanşı alacaktır

ilk atımızdır

This distinction is important.

Being the principal positive horse in an analysis paragraph does not
automatically fabricate a favorite or banko label.

The source's semantic strength is preserved rather than exaggerated.

### 10. Number-only rivals

A common editorial pattern is:

Sırasıyla rakip gördüğümüz isimler: 2-3-6

This is legitimate expert information.

The source may not repeat the horse names.

Raw extraction therefore preserves:

city
race number
horse number
horseName = null
label = rival

The model must never invent a missing horse name.

The official name is attached later only after TJK canonical validation.

### 11. Coupon blocks are a separate semantic language

An expert article may also contain:

ALTILI GANYAN TAHMİNİMİZ

1.Ayak: 5.6.1.4

2.Ayak: 4.2.3.1.7

These values are coupon construction.

They are not automatically direct expert-runner rows.

The number before Ayak is not automatically the official race number.

The numbers after Ayak are not automatically independent source
recommendations for persistence.

The extraction prompt explicitly excludes those blocks.

This prevents coupon syntax from contaminating runner identity.

### 12. Stage three: deterministic domain mapping

Raw labels are converted into the internal ExpertPickInput representation
inside TypeScript.

For example:

label rival
-> isRival = true

label strong
-> isStrong = true

labels favorite and strong
-> both internal flags become true

sourceRank remains null unless a future source adapter proves an explicit
source ranking contract.

Extraction confidence is application-assigned source-reading confidence,
not a model-estimated winning probability.

### 13. Stage four: TJK canonical validation

External commentary cannot create race identity.

The official identity key is:

Turkey race date
+ city
+ race number
+ horse number

If the external source also prints a horse name, that supplied name must
match the official TJK runner after normalization.

If it conflicts, the pick is rejected.

The system does not silently replace a conflicting supplied name.

For number-only rivals, the numeric canonical key is validated first.

Only then is the official TJK name attached.

This keeps convenience and integrity separate.

### 14. Persistence boundary

Only canonical validated ExpertPickInput rows reach expert_predictions.

The order is:

semantic source reading
-> raw semantic representation
-> deterministic domain mapping
-> TJK validation
-> persistence
-> consensus and scoring

A malformed or hallucinated upstream identity therefore cannot directly
affect scoring.

### 15. Cache architecture

The system distinguishes two publishing models.

#### Daily article model

A new article URL is published for a new date.

During the same Turkey date, a previously verified article may be reused.

Before repeat AI extraction, ordinary HTTP computes a semantic
fingerprint.

If the article is unchanged and current-date rows already exist, the
pipeline stops.

Workers AI calls = 0.

On a new Turkey date, the old daily article is not sent to AI just to
confirm that it is stale.

The system skips it and returns to discovery.

#### Stable current-page model

A stable URL remains constant while its content changes.

That URL may remain eligible across dates.

An AI-free HTTP fingerprint is checked first.

If unchanged, repeated semantic extraction is avoided.

If changed, semantic extraction is justified.

### 16. Why fingerprints are normalized

Raw HTML contains operational noise:

analytics scripts
tracking identifiers
random values
CSS changes
markup changes

Hashing raw HTML creates false cache misses.

Daily articles therefore fingerprint normalized visible text.

Landing/current pages also include normalized href destinations because
a new daily article may appear behind similar anchor text.

Fingerprinting is an optimization.

If HTTP fingerprinting fails, the semantic correctness pipeline remains
available.

### 17. Runtime gate

The expert subsystem has no useful work after the final upcoming race.

Therefore:

no upcoming canonical race
-> refresh interval null
-> expert pipeline stops

The cron scheduler may still wake for unrelated responsibilities.

This is an important distinction:

cron frequency is not upstream request frequency.

### 18. Provenance

Durable provenance represents verified success.

last_working_url is the URL that produced current canonical expert rows.

last_discovered_from_url is the landing/index page from which that
successful article was discovered.

last_discovery_method is the actual successful discovery path.

last_extraction_method is the extraction method that produced the
validated rows.

A cache hit is reuse rather than discovery.

A failed or semantically empty attempt does not replace successful
durable provenance.

### 19. Diagnostic taxonomy

SEMANTIC_EMPTY:

The semantic endpoint produced a valid extraction object but no useful
raw picks.

NO_CANONICAL_MATCH:

Raw picks existed, but official TJK validation rejected all of them.

EXTRACTION_FAILED:

No valid semantic result was produced because of a technical acquisition
or semantic endpoint failure.

NO_CURRENT_CARD:

Terminal source result after all appropriate current candidates were
processed without a current canonical prediction set.

SUCCESS:

At least one current expert pick survived canonical validation and was
persisted.

The terminal trace retains the more specific reason.

### 20. Cost architecture

A normal new daily article should normally require:

semantic call one:
current article selection.

semantic call two:
article pick extraction.

It should not normally require:

article extraction
plus SCRAPE semantic extraction
plus CONTENT semantic extraction.

Same-day unchanged cache should require:

zero semantic calls.

No upcoming race should require:

zero semantic calls.

Fallback capacity remains available for technical availability without
becoming the normal execution path.

### 21. Liderform incident

The 23 August 2026 Liderform investigation demonstrated the separation of
responsibilities.

Discovery successfully produced real DOM href candidates.

Candidate semantic selection returned the correct current article.

The article contained explicit Istanbul and Izmir race analyses, named
main selections and number-only rival lists.

The failure therefore occurred after successful discovery.

The remediation did not redesign the working discovery mechanism.

Instead it:

reduced extraction schema complexity;

explicitly separated coupon syntax from race-analysis syntax;

stopped semantic-empty retry amplification;

fixed CONTENT response-envelope parsing;

made cache behavior date-aware;

preserved canonical TJK validation;

and stopped expert upstream work when no upcoming race exists.

### 22. Production invariant

The final production invariant is:

Use deterministic evidence wherever deterministic evidence is sufficient.

Use semantic AI only where semantic interpretation is actually required.

Never let semantic convenience replace canonical validation.

Never let a fallback become the normal path merely because it exists.

Never spend upstream compute after its information can no longer improve
a pre-race decision.

## Authoritative production extraction path

This section supersedes older Browser `/json` article-extraction examples.

Discovery and extraction remain separate.

Discovery:

landing/index
-> rendered anchor discovery
-> hard candidate hygiene
-> bounded candidate AI selection
-> source-aware article URL validation

Extraction:

accepted article/current page
-> rendered CONTENT
-> editorial-text normalization
-> direct Workers AI JSON Mode
-> 4096 output-token ceiling
-> grouped race-level raw schema
-> deterministic expansion to horse-level picks
-> canonical TJK validation
-> persistence

The semantic grouping is a transport optimization only.

A source phrase such as:

Rakipler: 6-1-8

does not create one grouped runner in Two Horse.

It becomes separate runner identities 6, 1 and 8 before validation and
persistence.

The extraction AI remains responsible for understanding natural Turkish
expert language, including favorite, banko, strong, star, rival, surprise
and avoid semantics.

Workers AI usage diagnostics are retained with the extraction trace so
actual token use can be measured instead of inferred from the configured
maximum.

### Liderform current article policy

The preferred Liderform landing is `/haberler/analizler`.

The discovery layer removes known utility routes before candidate AI.

A second source-aware fence accepts only Liderform article-detail URLs in
the `/haberler/*.html` family.

If a current article is not yet published, discovery terminates as
`ARTICLE_NOT_PUBLISHED`; landing pages are not passed into article
extraction.

### Provenance levels

Discovery evidence and verified working evidence are intentionally
different.

`last_discovered_article_url` records the latest accepted discovery result.

`last_working_url` records only a URL that has passed extraction, current
TJK canonical validation and persistence.

A structured-output failure may therefore leave a valid discovered article
while correctly leaving `last_working_url` unchanged.

### Runtime cost gates

Expert acquisition is disabled when no upcoming canonical race exists.

This gate applies both to scheduled refresh and isolated admin source
refresh.

Repeated technical source failures use bounded backoff to prevent a broken
source from consuming the normal refresh budget indefinitely.

## Liderform completeness invariant and verified production preview

### Why the invariant exists

The 24 August 2026 Liderform article exposed a subtle structured-output
failure mode.

The first production extraction correctly found all six analyzed races
and all eighteen number-only rivals, but omitted the named main selection
from two races.

The resulting structure therefore contained:

6 races
4 main selections
18 rivals
22 horse-level picks

The missing main selections were:

Bursa race 9, horse 1, SİLUET

Elazığ race 8, horse 14, SKY TURK

This was not a discovery failure.

It was not a race-detection failure.

It was not a rival-grouping failure.

It was a semantic completeness failure: the AI understood the two races
well enough to extract their rival groups but omitted the paragraph's
main subject from selections[].

### Source-aware correction

Liderform now uses a source-specific structured-output rule requiring at
least one explicit selection for every returned analysis race.

The prompt also makes the main-subject contract explicit and covers
natural positive expressions such as:

"birincilikle tanışabilir"

"farklı sonuç elde edebilecek güçtedir"

A deterministic completeness oracle reads only the structural evidence
needed to verify:

city
race number
explicit main horse number

It does not infer labels, comments, rivals or confidence.

Those remain semantic AI responsibilities.

Thus deterministic code acts as a correctness guard rather than a second
expert parser.

### Verified result on 24 August 2026

A real production Workers AI preview was executed against:

https://liderform.com.tr/haberler/20266-pazartesi-bursada-6910-ve-elazigda-368-kosularin-analizi.html

The result was:

races = 6
main selections = 6
strong = 6
rivals = 18
total horse-level picks = 24
missing = 0
completeness.complete = true
article truncated = false

The six main selections were:

Bursa R6 #2 BIG HONEY — strong — "kazanmaya yakındır"

Bursa R9 #1 SİLUET — strong — "birincilikle tanışabilir"

Bursa R10 #5 CANASİLİM — strong — "önde gelen isimdir"

Elazığ R3 #2 DENİZİM HAN — strong — "ilk şansa sahiptir"

Elazığ R6 #9 ÇİLOBEY — strong — "rakiplerini geride bırakabilir"

Elazığ R8 #14 SKY TURK — strong —
"farklı sonuç elde edebilecek güçtedir"

Each race also retained its own independent rival number group.

The preview used the real production acquisition and Workers AI extraction
pipeline but intentionally performed no prediction persistence.

This establishes the required separation:

semantic extraction may be exercised diagnostically

without changing expert_predictions

without changing source health

without replacing last_working_url

and without weakening the no-upcoming-race production refresh gate.


## Authoritative config-driven source acquisition v3

Source URL and discovery policy is now declared in
`config/expert-acquisition.json`.

This section supersedes older source-specific URL maps and the previous
full-page semantic discovery fallback.

Discovery is:

verified entry
-> SCRAPE
-> CONTENT
-> HTTP
-> real href extraction
-> local config-driven evidence filtering
-> bounded candidate semantic selection
-> fetched target

Full-page semantic URL generation is not part of the production path.

When a verified entry moves, root-navigation recovery uses configured
navigation labels and then resumes the same discovery pipeline.

Article prefixes are preference signals, not permanent hard URL contracts.

Turkish month evidence is generated with `Intl.DateTimeFormat("tr-TR")`;
month names are not hard-coded.

Extraction remains semantic Workers AI extraction followed by deterministic
horse-level expansion and canonical TJK validation.

Source-specific semantic profiles remain explicit, including Liderform's
duplicate coupon rule and Altılı/Ayak sources' canonical six-fold mapping.

Multi-document source updates are fail closed and replace source/day rows
only after the entire resolved bundle validates.
