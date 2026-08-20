# Two Horse Diagnostics Runbook

## Goal

Production failure'ı en küçük subsystem'e kadar daraltmak.

## Investigation order

1. Worker/API reachable
2. auth boundary
3. router
4. D1
5. refresh_state
6. TJK program
7. races
8. runners
9. expert data
10. form data
11. field signals
12. scoring
13. coupon generation
14. API projection

## Error severity

ERROR:
Request veya pipeline tamamlanamadı.

WARN:
Degraded/fallback durum.

INFO:
Önemli lifecycle transition.

DEBUG:
Detaylı investigation.

## Never expose

- ADMIN_TOKEN
- Authorization header
- secrets
- complete sensitive request headers

## Root-cause rule

Downstream missing data görüldüğünde upstream state kontrol edilmeden
downstream kod değiştirilmez.

## Diagnostic contract

Probe'lar mümkün olduğunca:

- status
- component
- reason
- count
- timestamp
- version
- error class

döndürür.

Diagnostic endpoint state mutate etmemelidir.
