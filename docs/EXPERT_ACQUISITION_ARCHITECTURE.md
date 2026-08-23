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

After discovery, the article URL is already known.

The extraction question is now narrower:

Which horses does this source recommend, oppose or identify as rivals?

The normal extraction path is intentionally small:

selected article URL
-> Browser Run JSON(url)
-> RawExpertExtraction

One ordinary article extraction therefore requires one semantic AI call.

### 6. Semantic empty and technical failure are different states

A valid result such as:

{ "picks": [] }

is not a transport failure.

It is a semantic result.

The system records it as SEMANTIC_EMPTY.

It does not automatically execute the same semantic question two more
times using SCRAPE and CONTENT representations.

That older strategy multiplied Workers AI usage without establishing new
information.

A real technical error is different.

Examples include Browser Run request failure, timeout or failed semantic
transport.

Only then is an emergency representation fallback justified:

JSON(url) technical failure
-> CONTENT(url)
-> unwrap rendered HTML
-> JSON(html)

The emergency path exists for availability.

It is not the ordinary path.

### 7. Cloudflare CONTENT response handling

Cloudflare Browser Run Workers Bindings return Quick Action data through
a response envelope.

For CONTENT, rendered HTML belongs to the result field.

The application must parse the JSON response, unwrap result, verify that
the result is HTML text and only then pass it to downstream processing.

Treating the entire JSON envelope as if it were HTML corrupts the
extraction input.

### 8. Compact semantic contract

The semantic model should read source semantics.

It should not implement all Two Horse domain policy.

The raw contract therefore contains only:

city
raceNumber
horseNumber
horseName or null
comment or null
labels

The label vocabulary is intentionally finite:

favorite
banko
strong
star
rival
surprise
avoid

Application code performs deterministic mapping from labels to internal
boolean fields.

This reduces schema complexity, output size, ambiguity and Workers AI
token usage.

### 9. Natural Turkish expert language

Expert writers do not use one standardized taxonomy.

A main selection may be described as:

birinciliğin en güçlü adayıdır

ilk şansa sahiptir

birinciliğe çok yakındır

kazanmaya yakındır

rövanşı alacaktır

rakiplerinin bir adım önündedir

The semantic task therefore identifies the role of the horse in the
analysis rather than searching for only literal words such as favori or
banko.

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
