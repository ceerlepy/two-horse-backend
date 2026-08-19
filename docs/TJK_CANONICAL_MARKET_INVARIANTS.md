# TJK Canonical / Market Invariants

## Canonical programme

The TJK master page is discovery only.

Canonical domestic meetings are physical venues such as:

- İstanbul
- Elazığ
- İzmir
- Bursa
- Ankara

`Karma` is a TJK composite programme and is not persisted as a
canonical venue.

It must not independently enter:

- scoring
- AGF market history
- race history
- coupon generation

This prevents the same physical race from being represented twice.

## TJK acquisition

There is one canonical TJK acquisition pipeline.

Its extracted programme is shared by:

- race data
- runners
- AGF
- HP
- weight
- Son 6 Y. / form

A separate AGF web fetch is intentionally not used.

The acquisition fallback chain remains responsible for producing
the same canonical programme contract.

## AGF market history

AGF market movement is a pre-race signal.

Snapshots are written only while a race has not started.

A race's market history freezes at its official start time.

Manual force refreshes after race start must not alter the market
signal.

## Market score

Final market scoring uses the final 90-minute pre-race window.

Observations older than that may remain stored for diagnostics but
do not affect final market scoring.

Observations after race start are ignored even if legacy rows exist.

Market score semantics:

- 50 = neutral / flat movement
- above 50 = increasing AGF support
- below 50 = decreasing AGF support
- null = insufficient valid time-separated observations

Current AGF level itself is not counted again here because AGF has
its own scoring component.

## Unicode

Turkish strings remain UTF-8 application data.

Examples:

- İstanbul
- Elazığ
- İzmir
- Çim
- OĞUZBEYİ

JSON `\uXXXX` escaping in a client/debugger is a presentation detail,
not source-data corruption.

Do not add backend character substitutions merely to change how a
JSON client chooses to display Unicode.
