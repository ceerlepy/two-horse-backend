# Two Horse Backend — Diagnostic API Encyclopedia

Bu doküman /api/debug/* endpointlerini operasyon kitabı seviyesinde açıklar.

Tüm debug endpointleri ADMIN_TOKEN ister.

Desteklenen header biçimleri:

Authorization: Bearer <ADMIN_TOKEN>

veya

X-Admin-Token: <ADMIN_TOKEN>

Base example:

BASE_URL="https://two-horse-backend.veyseltosun-vt.workers.dev"

AUTH="Authorization: Bearer $ADMIN_TOKEN"

---

# 1. Genel diagnostic mantığı

Diagnostic investigation şu sırada yapılmalıdır:

SYSTEM
→ DATABASE
→ CANONICAL CARD
→ DATA QUALITY
→ PIPELINE
→ EXACT RACE
→ EXACT RUNNER
→ EXACT TABLE

Amaç downstream symptom'dan upstream root cause'a gitmektir.

Örnek:

runner score yanlış
→ önce runner var mı?
→ sonra source signals var mı?
→ sonra scoring config doğru mu?
→ sonra pipeline stale mi?
→ en son scoring bug aranır

---

# 2. GET /api/debug/overview

## Amaç

Sistemin current-day genel özetini tek requestte görmek.

## Input

Query param yok.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/overview" \
| jq

## Response fields

ok

Endpoint operation'ın başarılı olup olmadığını gösterir.

date

Turkey-local current race date.

raceCount

races tablosunda current date için kaç canonical race bulunduğu.

runnerCount

runners tablosunda current date için kaç runner bulunduğu.

enabledSources

source_registry tablosunda enabled=1 olan source sayısı.

diagnostics

Kullanılabilir diagnostic endpoint katalogu.

## DB ilişkileri

races

runnerCount için runners

enabledSources için source_registry

## Interpretation

raceCount=0 ve runnerCount=0

Canonical program ingestion problemi olasılığı yüksek.

raceCount>0 ve runnerCount=0

Race persistence var fakat runner persistence/parsing problemi olabilir.

enabledSources=0

Expert/source enrichment intentionally disabled veya registry yanlış.

## Next step

/api/debug/health/deep
/api/debug/card
/api/debug/refresh-state

---

# 3. GET /api/debug/health/deep

## Amaç

En hızlı "sistem temel olarak sağlıklı mı?" cevabı.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/health/deep" \
| jq

## Response fields

ok

Diagnostic query başarı durumu.

status

healthy

veya

degraded

veya failure response durumunda unhealthy.

database

D1 probe sonucu.

invalidCaptureTiming

learning_snapshot_candidates tablosunda:

captured_at >= starts_at

olan kayıt sayısı.

Bu değer ideal olarak her zaman 0 olmalıdır.

degradedSources

summarizeExpertSourceHealth'in effectiveStatus'una göre "stale" veya
"blocked"/"parse-error" olan enabled source sayısı — raw health_status
kolonu değil.

Raw kolon tek başına yanıltıcıdır: bir source bir kez "healthy" yazıp
bir daha hiç kontrol edilmemiş olabilir. effectiveStatus bunu
deriveEffectiveSourceStatus ile yakalar (bkz. ARCHITECTURE-DEEP-DIVE.md
bölüm 51): health_status=healthy VE bugün kontrol edilmemiş → stale.
"no-picks-today" (kart yok ama source bozuk değil) bu sayaca girmez.

expertSources

summarizeExpertSourceHealth'in tam çıktısı:

availableSources — enabled source sayısı
contributingSources — bugün en az bir expert_predictions satırı
  üreten source sayısı
staleSources — effectiveStatus="stale" olan sayı
failedSources — effectiveStatus blocked/parse-error/degraded olan sayı
sources — her source için sourceKey, healthStatus (raw),
  effectiveStatus, lastCheckedAt, lastSuccessAt, contributingToday

serverNow

Worker runtime UTC timestamp.

## DB ilişkileri

learning_snapshot_candidates

source_registry

expert_predictions (contributingToday hesaplaması için)

## Interpretation

invalidCaptureTiming > 0

Learning temporal leakage riski vardır.
En kritik invariant ihlalidir.

degradedSources > 0

En az bir expert source stale veya failed. expertSources.sources
içinde hangi source ve effectiveStatus'u ne olduğuna bakılmalı —
"no-picks-today" görülüyorsa bu bozukluk değil, dürüst bir sonuçtur.

database != healthy

D1 veya query seviyesinde problem.

## Next step

invalidCaptureTiming > 0
→ /api/debug/invariants
→ /api/debug/learning-pipeline

degradedSources > 0
→ /api/debug/sources
→ /api/debug/coverage

---

# 4. GET /api/debug/invariants

## Amaç

Sistemin bozulmaması gereken cross-table kurallarını tek yerde kontrol etmek.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/invariants" \
| jq

## Response

ok

Tüm invariant checks zero ise true.

checks.invalidCaptureTiming

Pre-race learning snapshot timing violation sayısı.

checks.orphanRunners

runners içinde karşılık gelen races row'u bulunmayan runner sayısı.

checks.duplicateWindows

Aynı:

race_date
city
sixfold_number

identity'siyle birden fazla sixfold_windows row olup olmadığı.

checks.duplicateSnapshotKeys

sixfold_coupon_snapshots içinde duplicate snapshot_key sayısı.

## DB ilişkileri

learning_snapshot_candidates

runners

races

sixfold_windows

sixfold_coupon_snapshots

## Interpretation

orphanRunners > 0

Canonical persistence integrity problemi.

duplicateWindows > 0

Six-fold window idempotency veya unique constraint problemi.

duplicateSnapshotKeys > 0

Coupon snapshot generation idempotency problemi.

## Next step

orphanRunners
→ /api/debug/card
→ /api/debug/race

duplicateWindows
→ /api/debug/sixfold

duplicateSnapshotKeys
→ /api/debug/sixfold
→ db table inspection

---

# 5. GET /api/debug/card

## Amaç

Bir günün canonical race-card özetini city bazında görmek.

## Query

date

Optional.

Format:

YYYY-MM-DD

Yoksa turkeyDate() kullanılır.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/card?date=2026-08-20" \
| jq

## Response

ok

Request başarı durumu.

date

İncelenen race date.

races[]

City-level race summary.

races[].city

Canonical city.

races[].race_count

O şehirdeki race sayısı.

races[].first_race

Minimum race_number.

races[].last_race

Maximum race_number.

races[].first_start

İlk yarış starts_at.

races[].last_start

Son yarış starts_at.

runners[]

City-level runner counts.

runners[].city

City.

runners[].runner_count

O city için runners row sayısı.

## DB ilişkileri

races

runners

## Interpretation

race_count normal, runner_count çok düşük

Runner parse veya persistence problemi.

City eksik

Program reconciliation/source acquisition problemi.

first/last race aralığı beklenmedik

Stale veya partial card ihtimali.

## Next step

/api/debug/race
/api/debug/coverage
/api/debug/refresh-state

---

# 6. GET /api/debug/race

## Amaç

Tek bir yarışın canonical race ve bütün runner satırlarını görmek.

## Query

date

Optional.

city

Required.

race

Required integer.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/race?city=İstanbul&race=3" \
| jq

## Response

ok

Race row bulunduysa true.

date

İncelenen tarih.

city

İncelenen şehir.

raceNumber

Race number.

race

races tablosundaki canonical row.

runners

runners tablosundaki o yarışın bütün atları.

## DB ilişkileri

races

runners

## Interpretation

race=null

Canonical race missing.

race var runners=[]

Runner parsing/persistence failure.

Runner sayısı TJK'den düşük

Partial parse veya identity mismatch.

## Next step

/api/debug/runner
/api/debug/card
/api/debug/coverage

---

# 7. GET /api/debug/runner

## Amaç

Tek atın bütün cross-pipeline trace'ini görmek.

Bu en önemli drill-down endpointlerinden biridir.

## Query

date

Optional.

city

Required.

race

Required integer.

horse

Required horse_number.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/runner?city=İstanbul&race=3&horse=5" \
| jq

## Response

ok

Canonical runner bulunduysa true.

identity.date

Race date.

identity.city

City.

identity.race

Race number.

identity.horse

Horse number.

runner

runners tablosundaki canonical runner row.

experts

expert_predictions tablosunda bu horse için bulunan source-level predictions.

market

agf_market_snapshots tablosunda en yeni 30 snapshot.

field

field_signals tablosundaki runner-level field rows.

## DB ilişkileri

runners

expert_predictions

agf_market_snapshots

field_signals

## Interpretation examples

runner var
experts=[]
market dolu
field dolu

Canonical runner doğru, expert pipeline eksik.

runner var
experts dolu
market=[]
field dolu

AGF/market capture problemi.

runner var
experts dolu
market dolu
field=[]

Field acquisition/matching problemi.

runner=null

Downstream kaynaklara bakmadan önce canonical race/runner ingestion araştırılmalı.

## Next step

Expert missing
→ /api/debug/sources

Market missing
→ /api/debug/coverage

Field missing
→ /api/debug/coverage

Runner missing
→ /api/debug/race

---

# 8. GET /api/debug/data-quality

## Amaç

Current date için missing feature oranlarını city bazında görmek.

## Query

date optional.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/data-quality" \
| jq

## Response

byCity[].city

City.

byCity[].runners

Total runner rows.

byCity[].missing_agf

agf_percent null olan runner sayısı.

byCity[].missing_form

recent_form_raw null/empty runner sayısı.

byCity[].missing_hp

hp null runner sayısı.

byCity[].missing_weight

weight null runner sayısı.

signalRows.experts

expert_predictions row count.

signalRows.market

agf_market_snapshots row count.

signalRows.field

tjk_score non-null field_signals row count.

raceFieldCoverage[]

Her city+race_number için form/HP eksikliğinin sınıflandırılması
(ARCHITECTURE-DEEP-DIVE.md bölüm 52):

city, raceNumber, totalRunners
missingForm, missingHp, unexplainedMissingHp
formCoverage / hpCoverage: "full-coverage" | "likely-not-published" |
  "partial-gap"

unexplainedMissingHp yalnızca recent_form_raw uzunluğu > 2 olan (yani
gerçek yarış geçmişi olan) runner'ların HP eksikliğini sayar — kısa
geçmişli atların (henüz handikap almamış) HP eksikliği bunun dışında
kalır.

unexplainedGaps.form / unexplainedGaps.hp

raceFieldCoverage'ın filtrelenmiş hali: form için formCoverage=
"partial-gap" olan satırlar, HP için unexplainedMissingHp > 0 olan
satırlar. ok alanı bu iki listenin ikisinin de boş olmasına bağlıdır.

fieldSignalCoverage[]

Her city+race_number için TJK field-signal (saha sinyali) kapsamı:

city, raceNumber, totalRunners, coveredRunners
coverageState: "no-data" | "partial-data" | "full-data"

Bu, scoring katmanının suppressPartialFieldCoverage ile aynı yarış-
seviyesi eşiği (coveredRunners/totalRunners < 0.5 → partial-data)
kullanır (ARCHITECTURE-DEEP-DIVE.md bölüm 53) — burada görülen
partial-data bir yarış, o yarışta field_score'un HER runner için
(zaten sahip olanlar dahil) null'a bastırıldığı yarıştır.

partialFieldCoverageRaces[]

fieldSignalCoverage'ın coverageState="partial-data" olan alt kümesi —
scoring'in field sinyalini bastırdığı yarışları doğrudan gösterir.

ok

formGaps (partial-gap) ve hpGaps (unexplainedMissingHp > 0) ikisi de
boşsa true.

## DB ilişkileri

runners

expert_predictions

agf_market_snapshots

field_signals

## Interpretation

missing_agf yüksek

AGF acquisition/parse eksikliği.

missing_form yüksek

Form acquisition eksikliği — ama önce raceFieldCoverage'a bakılmalı:
formCoverage="likely-not-published" olan satırlar (tüm yarış birlikte
eksik) genelde debut/maiden kartı, gerçek bir regresyon değil. Alarm
formCoverage="partial-gap" (dağınık alt küme) satırlarındadır.

missing_hp yüksek

Aynı ayrım HP için de geçerli: unexplainedMissingHp = 0 olan satırlar
kısa geçmişli atlardan (TJK henüz handikap atamamış) kaynaklanıyor
olabilir, bug değildir. unexplainedGaps.hp doluysa gerçek bir sorun
vardır.

missing_weight yüksek

Runner canonical attributes eksik olabilir.

experts=0

Expert pipeline current card için boş.

market=0

AGF snapshots yok.

partialFieldCoverageRaces dolu

Bu yarışlarda field bileşeni tüm runner'lar için bastırılmış —
scoring bug'ı değil, kasıtlı adalet düzeltmesi (bkz. bölüm 53). Sorun
şu ki field sinyali gerçekten yaygın biçimde eksikse (birçok yarışta
partial-data), field acquisition pipeline'ının kendisi (src/field/service.ts)
araştırılmalı.

field=0

Field signals score üretmemiş.

---

# 9. GET /api/debug/pipeline

## Amaç

Refresh, source, learning ve coupon pipeline state'ini beraber görmek.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/pipeline" \
| jq

## Response

serverNow

Worker UTC time.

refreshState

refresh_state tablosundaki bütün pipeline rows.

sourceSummary

source_registry rows health/enabled gruplaması.

learning.candidate_count

learning_snapshot_candidates toplam count.

learning.invalid_capture_timing

captured_at >= starts_at rows.

learning.latest_capture

En yeni candidate capture time.

coupons.total

sixfold_coupon_snapshots toplam row.

coupons.pending

evaluated_at null coupon snapshots.

coupons.latest_generation

En son generation timestamp.

sixfoldCouponHealth

coupons alanının daha ayrıntılı, ARCHITECTURE-DEEP-DIVE.md bölüm 55'te
açıklanan hali:

total, evaluated
pending — evaluated_at null VE unresolved_reason null (gerçekten
  bekleyen, henüz sonuç gelmemiş)
unresolved — unresolved_reason not null (SIXFOLD_STALE_AFTER_DAYS
  gün geçmesine rağmen hiçbir zaman çözülemeyen — örn. ingestion hiç
  başlamamış bir toplantı)
overdueUnclassified — pending olup SIXFOLD_STALE_AFTER_DAYS'ten daha
  eski olan satır sayısı; > 0 ise cron çalışmıyor demektir
ok — overdueUnclassified === 0

sixfoldCalibration

recalibrateSixFoldProbabilities'in son çalıştığında yazdığı satır
(ARCHITECTURE-DEEP-DIVE.md bölüm 56):

sampleCount, predictedAvgCoverage, actualHitRate
temperature — optimizeSixFoldCoupons'a geçirilen güncel değer
status — "insufficient-data" | "partial" | "calibrated"

MIN_CALIBRATION_SAMPLES (50) altında sampleCount ise temperature hep
varsayılan (14) kalır — bu bug değildir, henüz yeterli değerlendirilmiş
kupon yoktur.

## DB ilişkileri

refresh_state

source_registry

learning_snapshot_candidates

sixfold_coupon_snapshots

sixfold_probability_calibration

## Interpretation

refresh_state stale

Scheduled/admin refresh pipeline çalışmıyor olabilir.

candidate_count=0

Learning capture henüz başlamamış veya data yok.

pending coupon sürekli büyüyor

sixfoldCouponHealth.overdueUnclassified'a bakılmalı: 0 ise bu
snapshot'lar henüz normal şekilde sonuç bekliyor demektir (evaluation/
result ingestion gecikiyor olabilir). > 0 ise cron'un kendisi
çalışmıyor — SIXFOLD_STALE_AFTER_DAYS günden eski satırlar zaten
unresolved'a düşmüş olmalıydı.

---

# 10. GET /api/debug/db/schema

## Amaç

D1'ın gerçek runtime schema'sını görmek.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/db/schema" \
| jq

## Response

objects[].type

table
index
view
trigger gibi sqlite object tipi.

objects[].name

Object name.

objects[].tbl_name

Bağlı olduğu table.

objects[].sql

DDL definition.

## DB ilişkileri

sqlite_master

## Kullanım

Migration uygulandı mı?

Unique constraint gerçekten var mı?

Column/table ismi productionda ne?

Sorularında authoritative runtime view sağlar.

---

# 11. GET /api/debug/db/counts

## Amaç

Bütün D1 tablolarının row countlarını görmek.

Yalnızca uygulamanın kendi tabloları listelenir — filterAppTableNames
(src/api/diagnostics/db.ts) `_cf_KV` ve `d1_migrations` gibi D1'in
kendi iç bookkeeping tablolarını dışarıda bırakır. Bunlar
validIdentifier'dan geçtiği ve isimleri sqlite_% ile başlamadığı için
eskiden bu listede uygulama tablolarıyla yan yana görünüyorlardı — hiç
uygulama anlamı taşımayan gürültü.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/db/counts" \
| jq

## Response

counts[].table

Table name.

counts[].rows

Row count.

counts[].error

Count query fail olmuşsa hata.

## Kullanım

Beklenmedik empty table tespiti.

Growth anomaly.

Pipeline hiç yazıyor mu?

---

# 12. GET /api/debug/table

## Amaç

Bir D1 table'ı read-only raw incelemek.

## Query

name

Required.

limit

Optional.

Default 50.

Maximum 100.

## Example

curl -s \
  -H "$AUTH" \
  "$BASE_URL/api/debug/table?name=refresh_state&limit=20" \
| jq

## Response

table

İncelenen table name.

limit

Applied limit.

rows

Raw table rows.

## Security

Table name allow-list runtime sqlite_master'dan gelir.

Arbitrary SQL kabul edilmez.

## Kullanım

Exact persistence state görmek.

---

# 13. GET /api/debug/config

## Amaç

Secret göstermeden runtime/model configuration görmek.

## Response

application.name

APP_NAME.

application.version

APP_VERSION.

model.scoring

MODEL_VERSION.

model.learning

LEARNING_POLICY_VERSION.

model.coupon

COUPON_POLICY_VERSION.

security.adminTokenConfigured

ADMIN_TOKEN configured mı.

Token değeri asla dönmez.

logging.level

LOG_LEVEL.

logging.debugSampleRate

LOG_DEBUG_SAMPLE_RATE.

---

# 14. GET /api/debug/scoring-config

## Amaç

Production scoring configuration görmek.

## Response

weights

SCORING_WEIGHTS object.

totalWeight

Configured toplam scoring weight.

modelVersion

MODEL_VERSION.

learningPolicyVersion

LEARNING_POLICY_VERSION.

couponPolicyVersion

COUPON_POLICY_VERSION.

## Kullanım

Beklenen scoring weight productionda gerçekten deploy edilmiş mi?

Model behavior hangi version?

---

# 15. Existing diagnostics

Aşağıdaki endpointler daha eski fakat hâlâ önemlidir:

/api/debug/sixfold

Six-fold windows ve coupon persistence.

DB ilişkileri:

sixfold_windows
sixfold_coupon_snapshots

/api/debug/sources

Expert source registry/health.

DB ilişkisi:

source_registry

/api/debug/learning

Learning evaluation/gate.

Learning tables.

/api/debug/learning-pipeline

Candidate/promotion/result label zinciri.

/api/debug/model

Model diagnostics.

/api/debug/coverage

Runner AGF/form/expert/market/field coverage.

/api/debug/refresh-state

refresh_state rows.

---

# 16. Production investigation recipes

## "Bugünkü yarışlar yanlış"

overview
→ card
→ refresh-state
→ coverage
→ race

## "Tek bir atın tahmini saçma"

runner
→ scoring-config
→ coverage
→ sources
→ market/field rows

## "Kupon yanlış"

sixfold
→ race
→ runner
→ scoring-config
→ pipeline

## "Learning yanlış"

health/deep
→ invariants
→ learning-pipeline
→ learning
→ raw learning table

## "Bir source çalışmıyor"

sources
→ coverage
→ runner
→ refresh-state

## "DB migration problemi"

db/schema
→ db/counts
→ table

---

# 17. Diagnostic golden rules

Debug API state mutate etmemelidir.

Secret dönmemelidir.

Null ile zero aynı anlam değildir.

Empty array çoğu zaman "source usable data yok" anlamına gelir.

Canonical runner yoksa downstream enrichment araştırılmaz.

Temporal invariant bozuksa learning accuracy güvenilmez kabul edilir.

Diagnostic sonuçları mümkün olduğunca root cause daraltmak için birlikte okunmalıdır.

---

# POST /api/admin/preview-expert-source

## Amaç

Gerçek production expert acquisition + Workers AI extraction pipeline'ını
çalıştırır ancak sonucu D1 expert prediction tablolarına persist etmez.

Bu endpoint özellikle normal expert refresh'in:

SKIPPED_NO_UPCOMING_RACE

durumunda olduğu saatlerde completed-day extraction doğrulaması yapmak
içindir.

## Input

Query:

source=<source_key>

Örnek:

curl -sS \
  -X POST \
  -H "$AUTH" \
  "$BASE_URL/api/admin/preview-expert-source?source=liderform" \
| python -m json.tool

## Güvenlik ve side-effect contract

Endpoint ADMIN_TOKEN ister.

Preview:

persisted=false

olmalıdır.

Şunları değiştirmez:

expert_predictions

source health

last_working_url

refresh trace

Normal scheduled refresh'in no-upcoming-race gate'ini de değiştirmez.

## Önemli response alanları

counts.races

Semantic extraction tarafından bulunan distinct race sayısı.

counts.main

favorite, banko, strong, star veya surprise ana seçimlerinden en az birine
sahip horse-level seçim sayısı.

counts.strong

strong label alan seçim sayısı.

counts.rival

rival label alan horse-level seçim sayısı.

counts.total

Grouped AI transport TypeScript tarafından horse-level domain kayıtlarına
açıldıktan sonraki toplam pick sayısı.

mainPicks

Named/commented ana seçimlerin kısa diagnostic listesi.

rivalsByRace

Her yarışın number-only rival grubunun horse number listesi.

completeness

Source-aware completeness guard sonucu.

Liderform için:

complete=true

ve

missing=[]

beklenir.

semantic.usage

Gerçek Workers AI token/neuron kullanımını gösterir.

## 24 Ağustos 2026 Liderform doğrulaması

Gerçek production preview sonucu:

races=6

main=6

strong=6

rival=18

total=24

favorite=0

banko=0

missing=[]

completeness.complete=true

Bu testte daha önce eksik kalan iki ana selection da doğru geldi:

Bursa R9 #1 SİLUET

Elazığ R8 #14 SKY TURK

Bu nedenle corrected Liderform semantic extraction path'i 24/24 olarak
production Workers AI üzerinde doğrulanmıştır.


## Config-driven expert preview

Read-only endpoint:

`POST /api/admin/preview-expert-source?source=<source_key>`

Historical regression:

`POST /api/admin/preview-expert-source?source=<source_key>&date=YYYY-MM-DD`

Preview runs the same config-driven resolver, SCRAPE/CONTENT/HTTP
acquisition, Workers AI extraction and TJK canonical validation used by
production.

It does not persist expert predictions and does not write mismatch
anomalies.

Inspect:

`resolution`
`targets`
`extractionAttempts`
`counts`
`mainPicks`
`semanticUsage`
