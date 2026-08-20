# Operations Runbook

## ADMIN_TOKEN oluşturma

Cloudflare size özel bir ADMIN_TOKEN vermez.

Kendiniz high-entropy secret üretirsiniz:

python3 -c 'import secrets; print(secrets.token_urlsafe(48))'

Cloudflare:

Workers & Pages
-> two-horse-backend
-> Settings
-> Variables and Secrets
-> Add
-> Secret

Name:

ADMIN_TOKEN

Value:

üretilen secret

Secret Git'e commit edilmez.

## Termux test environment

export BASE_URL='https://two-horse-backend.veyseltosun-vt.workers.dev'

export ADMIN_TOKEN='BURAYA_SECRET'

export AUTH="Authorization: Bearer $ADMIN_TOKEN"

Örnek:

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/health/deep" \
| jq

## Logging

Default:

LOG_LEVEL=info

Debug gerektiğinde:

LOG_LEVEL=debug

LOG_DEBUG_SAMPLE_RATE=0.10

Debug kalıcı açık tutulmamalıdır.

## İlk incident bundle

/api/debug/health/deep

/api/debug/invariants

/api/debug/card

/api/debug/coverage

/api/debug/refresh-state
