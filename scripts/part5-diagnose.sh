#!/usr/bin/env bash
#
# Part 5 expert-source diagnostics.
#
# Calls /api/admin/preview-expert-source for every configured source and
# prints a compact report to stdout. Designed to be run from CI so the
# output can be posted somewhere readable (issue, job summary).
#
# Env:
#   BASE_URL      required, e.g. https://two-horse-backend.veyseltosun-vt.workers.dev
#   ADMIN_TOKEN   required, bearer token for /api/admin/*
#   DATE          optional, YYYY-MM-DD, defaults to today in Europe/Istanbul
#   SOURCES       optional, space separated, defaults to all eight

set -uo pipefail

BASE_URL="${BASE_URL:?BASE_URL is required}"
ADMIN_TOKEN="${ADMIN_TOKEN:?ADMIN_TOKEN is required}"
DATE="${DATE:-$(TZ=Europe/Istanbul date +%F)}"

read -r -a SOURCE_LIST <<< "${SOURCES:-horseturk liderform yaris_analizi yaris_dergisi banko_tahminler istinye_ganyan ganyan_canavari afa}"

echo "Part 5 diagnostics"
echo "date=$DATE"
echo "base=$BASE_URL"
echo "sources=${SOURCE_LIST[*]}"

for SRC in "${SOURCE_LIST[@]}"; do
  echo
  echo "============================================================"
  echo "SOURCE: $SRC"
  echo "============================================================"

  TMP="$(mktemp)"

  HTTP="$(
    curl \
      --http1.1 \
      --retry 2 \
      --retry-all-errors \
      --connect-timeout 15 \
      --max-time 150 \
      -sS \
      -X POST \
      -o "$TMP" \
      -w '%{http_code}' \
      "$BASE_URL/api/admin/preview-expert-source?source=$SRC&date=$DATE" \
      -H "Authorization: Bearer $ADMIN_TOKEN" \
      || true
  )"

  echo "HTTP=$HTTP"

  python3 scripts/part5_report.py "$TMP"

  rm -f "$TMP"
  sleep 2
done
