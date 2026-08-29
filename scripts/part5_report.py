"""Render a compact Part 5 preview report from a preview-expert-source response.

Usage: python3 scripts/part5_report.py <path-to-json>

Kept deliberately terse: the output is meant to be pasted into a GitHub issue
body, which caps out at 65536 characters for the whole report.
"""

import json
import sys

EXCERPT_CAP = 2500
ACQUISITION_CAP = 3000
ARTICLE_CAP = 2000
RESOLUTION_CAP = 14000


def dump(value, cap):
    if value is None:
        return "None"
    text = json.dumps(value, ensure_ascii=False, indent=2)
    if len(text) > cap:
        return text[:cap] + f"\n... [truncated, {len(text)} chars total]"
    return text


def main():
    path = sys.argv[1]

    with open(path, encoding="utf-8", errors="replace") as handle:
        raw = handle.read()

    if not raw.strip():
        print("EMPTY_RESPONSE")
        return

    try:
        payload = json.loads(raw)
    except Exception as error:
        print("INVALID_JSON =", error)
        print(raw[:4000])
        return

    acceptance = payload.get("part5Acceptance") or {}
    resolution = payload.get("resolution") or {}
    attempts = payload.get("extractionAttempts") or []

    print("STATUS           =", payload.get("status"))
    print("PASS             =", acceptance.get("pass"))
    print("VALIDATED        =", acceptance.get("totalValidated"))
    print("VALIDATED_CITIES =", acceptance.get("validatedCities"))
    print("MISSING_CITIES   =", acceptance.get("missingValidatedCities"))
    print("CANONICAL        =", acceptance.get("allDocumentsCanonical"))
    print("RESOLUTION       =", resolution.get("status"))
    print("METHOD           =", resolution.get("discoveryMethod"))
    print("TARGETS          =", resolution.get("targets"))

    for index, attempt in enumerate(attempts, 1):
        diagnostics = attempt.get("diagnostics") or {}
        semantic = diagnostics.get("semanticInput") or {}

        print()
        print(f"DOC[{index}] URL       =", attempt.get("url"))
        print(f"DOC[{index}] STATUS    =", attempt.get("status"))
        print(f"DOC[{index}] METHOD    =", attempt.get("method"))
        print(f"DOC[{index}] EXTRACTED =", attempt.get("extracted"))
        print(f"DOC[{index}] VALIDATED =", attempt.get("validated"))
        print(f"DOC[{index}] CANONICAL =", attempt.get("completeCanonical"))
        print(f"DOC[{index}] ERROR     =", attempt.get("error"))
        print(f"DOC[{index}] ACQUISITION =", dump(diagnostics.get("acquisition"), ACQUISITION_CAP))

        rejected = attempt.get("rejectedPicks")
        if rejected:
            print(f"DOC[{index}] REJECTED_PICKS =", dump(rejected, ARTICLE_CAP))

        excerpt = semantic.get("excerpt")
        if excerpt:
            print(f"DOC[{index}] SEMANTIC_EXCERPT:")
            print(str(excerpt)[:EXCERPT_CAP])

        article = diagnostics.get("articleText")
        if article:
            print(f"DOC[{index}] ARTICLE_TEXT:")
            print(dump(article, ARTICLE_CAP))

    print()
    print("RESOLUTION_DIAGNOSTICS:")
    print(dump(resolution.get("diagnostics"), RESOLUTION_CAP))


if __name__ == "__main__":
    main()
