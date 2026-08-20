# Two Horse Backend — Architecture Deep Dive

## 1. Amaç

Backend'in görevi:

TJK canonical programını, uzman tahminlerini, AGF/market hareketini, form verisini ve field sinyallerini birleştirerek her at için model skoru üretmek; yarış belirsizliğini hesaplamak; altılı kuponu bütçe altında optimize etmek; pre-race snapshot'ı zaman açısından güvenli biçimde saklamak; resmi sonuçlar geldikten sonra değerlendirmek ve learning pipeline'ını beslemektir.

Temel zaman akışı:

PRE-RACE DATA
-> SCORE
-> SNAPSHOT
-> RACE START
-> OFFICIAL RESULT
-> LABEL
-> EVALUATION

Resmi sonuç hiçbir zaman pre-race feature olarak geriye sızamaz.

## 2. Ana paketler

src/tjk
Canonical TJK program acquisition, parsing, validation ve reconciliation.

src/storage
D1 üzerinde meetings, races ve runners canonical persistence.

src/experts
Expert kaynak fetch, semantic extraction, normalize, source health ve consensus.

src/form
Recent form acquisition ve scoring.

src/market
AGF snapshot ve market movement.

src/field
Field/saha sinyalleri.

src/scoring
Model component scoring ve weighted aggregation.

src/coupons
Altılı window, cost, global budget optimizer, snapshot persistence ve evaluation.

src/learning
Pre-race candidate, promotion, label, priors, calibration, evaluation gate.

src/results
Official result acquisition ve learning label ingestion.

src/history
Started race finalization ve retention.

src/api
Public/admin/debug HTTP boundary.

src/observability
Structured logging.

## 3. Scoring

Configured weights:

AGF 25
Expert 22
Form 18
HP 15
Market 10
Weight 5
Field 5

Toplam 100.

Eksik component zero sayılmaz.

availableWeight =
mevcut component weight toplamı

effectiveWeight =
configuredWeight / availableWeight * 100

finalScore =
SUM(componentScore * effectiveWeight) / 100

confidence =
availableWeight / 100

Örnek:

AGF + Form + HP + Weight mevcutysa:

25 + 18 + 15 + 5 = 63

confidence = 0.63

Expert, market veya field eksik olduğu için at yapay olarak zero penalty almaz.

## 4. Altılı optimizer

At skorları önce race içi probability'ye çevrilir.

relative =
exp((score - bestScore) / temperature)

Temperature = 14.

Confidence clamp:

min 0.20
max 1.00

raw probability weight:

relative * (0.60 + 0.40 * confidence)

Her ayakta seçilen atların probability toplamı:

legCoverage

Altı ayağın survival probability:

P =
coverage1 *
coverage2 *
coverage3 *
coverage4 *
coverage5 *
coverage6

Kupon kombinasyonu:

N =
n1*n2*n3*n4*n5*n6

Fiyat:

totalTL =
N * unitPriceTL * multiplier

Profiles:

cautious yaklaşık %45 budget target
balanced yaklaşık %80
maximum-coverage %100

Global optimizer meet-in-the-middle yaklaşımıyla legal prefix selection count kombinasyonlarını değerlendirir.

Amaç:

budget altında en yüksek modeled survival probability.

Amaç bütçenin her kuruşunu harcamak değildir.

## 5. Learning temporal invariant

learning_snapshot_candidates için:

captured_at < starts_at

olmak zorundadır.

Race başladıktan sonra yeni pre-race data oluşturulamaz.

Started race için sadece daha önce capture edilmiş candidate promote edilir.

Official result yalnızca label'dır.

## 6. Coupon snapshot invariant

GET /api/coupons/generate:

preview/read-only

POST /api/coupons/generate:

ADMIN_TOKEN gerekir.

POST snapshot ancak tüm seçilen legs henüz başlamadıysa persist edilir.

Post-start prediction evaluation dataset'ine giremez.

## 7. Auth

Protected:

/api/admin/*
/api/debug/*
POST /api/coupons/generate

Accepted:

Authorization: Bearer ADMIN_TOKEN

veya

X-Admin-Token: ADMIN_TOKEN

ADMIN_TOKEN konfigüre edilmemişse fail closed:

503 ADMIN_AUTH_NOT_CONFIGURED

Yanlış token:

401 UNAUTHORIZED

## 8. Logging

Default:

LOG_LEVEL=info

Levels:

debug
info
warn
error

Debug sampled çalışır.

Default sample:

LOG_DEBUG_SAMPLE_RATE=0.10

Logging D1'e yazılmaz.

Cloudflare console/observability kullanılır.

Sensitive field adları:

token
secret
password
authorization
cookie
credential

redact edilir.

## 9. Scheduled pipeline

1. program.refresh
2. experts.refresh
3. field.refresh
4. learning.capture-pre-race
5. learning.promote-started
6. history.finalize-started
7. results.ingest-official
8. coupons.evaluate
9. market.cleanup
10. learning.cleanup
11. history.cleanup

Her task independently observed edilir.

Bir task failure diğer scheduled işleri durdurmaz.

## 10. Debug sırası

Problem olduğunda:

1 /api/debug/health/deep
2 /api/debug/invariants
3 /api/debug/card
4 /api/debug/coverage
5 /api/debug/refresh-state

Tek yarış:

/api/debug/race?city=İstanbul&race=1

Tek at:

/api/debug/runner?city=İstanbul&race=1&horse=5

DB schema:

/api/debug/db/schema

DB counts:

/api/debug/db/counts

Model config:

/api/debug/scoring-config

## 11. Kritik invariants

- canonical TJK identity external source ile overwrite edilmez
- captured_at < starts_at
- official result feature değildir
- GET coupon snapshot persist etmez
- post-start snapshot persist etmez
- operational endpoints token olmadan açılmaz
- missing scoring components renormalize edilir
- stale cities/windows reconcile edilir
- source failure canonical programı bozamaz
- credentials loglanmaz

## 12. D1 table family anlamları

meetings
Günlük şehir/meeting root.

races
Meeting içindeki yarışlar.

runners
Canonical at listesi ve TJK runner attributes.

source_registry
Expert kaynak metadata, enabled ve health.

expert_predictions
Source bazlı at tahminleri.

agf_market_snapshots
Zaman serili market/AGF snapshot.

field_signals
Field signal runner mapping.

learning_snapshot_candidates
Henüz yarış başlamadan yakalanmış candidate feature state.

learning_races
Promote edilmiş learning race record.

learning_runner_features
Model/evaluation runner features ve finish labels.

learning_model_state
Learning gate metrics.

sixfold_windows
Altılı başlangıç/bitiş penceresi.

sixfold_coupon_snapshots
Frozen coupon evaluation snapshots.

official_result_runs
Official result ingestion runtime/audit.

refresh_state
Pipeline freshness/refresh state.

## 13. Production acceptance

Production-ready sayılması için:

CI green
auth green
GET read-only green
pre-race snapshot green
post-start protection green
global optimizer green
TJK window correctness green
stale card reconciliation green
result ingestion green
learning timing green
expert/market/field coverage green
