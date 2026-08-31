# Two Horse Backend — Architecture Deep Dive

## 1. Purpose

Two Horse backend, Türkiye at yarışı verisini birden fazla kaynaktan toplayan,
normalize eden, zenginleştiren, puanlayan ve kupon üretiminde kullanan bir
Cloudflare Worker backend sistemidir.

Temel hedef yalnızca yarış listesini göstermek değildir.

Sistem şu zinciri güvenilir biçimde kurmaya çalışır:

SOURCE
→ FETCH
→ PARSE
→ NORMALIZE
→ STORE
→ ENRICH
→ SCORE
→ RANK
→ COUPON OPTIMIZATION
→ API
→ DIAGNOSTICS

Her katman mümkün olduğunca diğer katmanın implementasyon detayından bağımsız
olmalıdır.

---

# 2. Architectural principles

## 2.1 Source of truth

Production davranışı için GitHub main source of truth'tur.

Runtime state için Cloudflare/D1 katmanı source of truth olabilir.

External web kaynakları authoritative kabul edilmez; onlar input source'dur.

## 2.2 Fail closed

Admin/debug veya state değiştiren hassas operasyonlar authorization belirsizse
çalışmamalıdır.

UNKNOWN AUTH
→ DENY

şeklinde davranılır.

## 2.3 Observable system

Bir hata yalnızca "500" olarak görülmemelidir.

Teşhis zinciri mümkün olduğunca şunu açıklayabilmelidir:

request
→ route
→ subsystem
→ pipeline
→ source
→ operation
→ failure class
→ persisted state

## 2.4 Small diagnostic surfaces

Tek devasa debug endpoint yerine subsystem seviyesinde küçük diagnostic
surface'ler tercih edilir.

Bu sayede bir failure'ın blast radius'u daha hızlı bulunabilir.

## 2.5 Deterministic scoring

Aynı normalized input + aynı model/policy version mümkün olduğunca aynı scoring
sonucunu üretmelidir.

## 2.6 Graceful degradation

Bir expert/source bozulduğunda mümkünse tüm yarış programı kullanılamaz hale
gelmemelidir.

Source health ile business-data availability birbirinden ayrılmalıdır.

---

# 3. High-level request lifecycle

Client request

→ Worker entry point
→ router
→ authentication / authorization
→ request validation
→ domain service
→ repository / pipeline
→ D1 or external source
→ domain transformation
→ response serialization

Diagnostic requestlerde:

Client
→ admin authorization
→ diagnostic router
→ narrowly scoped probe
→ sanitized result

---

# 4. Source tree mental model

## src/api

HTTP boundary.

Görevi:

- URL/method routing
- authorization boundary
- input parsing
- response creation
- diagnostics exposure

Business logic mümkün olduğunca burada büyümemelidir.

### router.ts

Ana HTTP dispatcher.

Router'ın görevi orchestration'dır; scoring algoritması veya scraping parser'ı
olmak değildir.

### auth.ts

Admin/debug authorization semantics.

Fail-closed güvenlik boundary'sidir.

### system-diagnostics.ts

Sistemin runtime durumunu açıklayan diagnostic aggregation katmanıdır.

Diagnostic kod production business sonucunu değiştirmemelidir.

### diagnostics/

Küçük diagnostic probe/helper katmanı.

Amaç büyük system-diagnostics implementasyonunu okunabilir ve test edilebilir
parçalara ayırmaktır.

---

## src/tjk

TJK program/race ingestion domain'i.

Sorumlulukları genel olarak:

- yarış programını alma
- source response validation
- parse
- race/runner normalization
- refresh kararları
- fallback stratejileri

TJK pipeline sistemin upstream temelidir.

Buradaki hata downstream'de:

missing races
missing runners
missing scores
missing coupons

olarak görülebilir.

Bu nedenle root cause analizinde upstream önce kontrol edilmelidir.

---

## src/storage

Persistence/repository boundary.

Raw SQL'in application'ın her yerine yayılması yerine veri erişiminin
merkezileştirilmesi hedeflenir.

Repository abstraction şu soruların cevabını tek yerde tutmalıdır:

- veri nereden okunuyor?
- nasıl yazılıyor?
- mevcut snapshot hangisi?
- refresh gerekli mi?
- hangi tarih/program active?

---

## src/experts

Expert prediction ingestion.

External expert kaynakları availability ve parse açısından birbirinden bağımsız
başarısız olabilir.

Expert consensus scoring inputlarından biridir; tek başına gerçek değildir.

---

## src/form

Horse form enrichment.

Geçmiş performans bilgisini scoring pipeline'a taşır.

Raw historical observation ile derived form signal birbirinden kavramsal olarak
ayrılmalıdır.

---

## src/field

Race/field seviyesindeki contextual signal enrichment.

Bir atın performansı yalnızca atın kendi geçmişinden değil yarışın bağlamından
da etkilenebileceği için field-level feature'lar ayrı domain concern olarak
tutulur.

---

## src/scoring

Feature'ları ortak ranking score'a dönüştüren katman.

Scoring weight'leri model davranışının önemli contract'ıdır.

Weight değişikliği sıradan refactor değildir; model davranışı değişikliğidir.

Bu nedenle versioning ve test önemlidir.

Conceptual model:

normalized runner
+ AGF/market
+ expert consensus
+ form
+ HP
+ contextual signals
+ weight/policy inputs
→ component scores
→ weighted aggregate
→ ranking/confidence

---

## src/model

Model/policy version metadata.

Model version değişiklikleri geçmiş prediction ile yeni prediction'ın neden
farklı olabileceğini açıklamak için önemlidir.

MODEL_VERSION

LEARNING_POLICY_VERSION

COUPON_POLICY_VERSION

gibi version'lar behavior provenance sağlar.

---

## src/coupons

Race ranking sonuçlarından oynanabilir kupon kombinasyonları üretir.

Kupon problemi yalnızca her ayağın en iyi atını seçmek değildir.

Amaç risk, coverage ve combination cost arasında optimizasyon yapmaktır.

Conceptually:

race candidates
→ per-leg alternatives
→ combination search
→ constraints
→ global evaluation
→ ranked coupon set

Six-fold coupon üretiminde her ayağı bağımsız greedy seçmek global optimum
vermeyebilir.

Bu nedenle optimizer tüm legs üzerinde kombinasyonu değerlendirebilir.

---

## src/history

Geçmiş sonuç/prediction erişimi.

Önemli prensip:

Geçmiş prediction mümkünse bugünkü modelle yeniden hesaplanmamalıdır.

Historical snapshot, o anda sistemin gerçekten ne düşündüğünü temsil etmelidir.

Bu model evaluation açısından kritiktir.

---

## src/observability

Structured logging ve operational visibility.

Log seviyeleri:

ERROR
Gerçek operation failure.

WARN
Degraded fakat sistemin devam edebildiği durum.

INFO
Önemli lifecycle/state transition.

DEBUG
Derin teşhis; production noise yaratmaması gerekir.

Logların amacı kodun her satırını anlatmak değil failure path'i yeniden
oluşturabilmektir.

---

# 5. Data pipeline

## Stage A — discovery

Hangi yarış/program işlenecek belirlenir.

## Stage B — fetch

External source çağrılır.

Network failure ile parse failure aynı hata değildir.

## Stage C — parse

Source representation internal representation'a çevrilir.

## Stage D — normalize

Source-specific format domain model'e dönüştürülür.

## Stage E — persist

Program/snapshot/state D1'a yazılır.

## Stage F — enrichment

Expert/form/field/market vb. sinyaller eklenir.

## Stage G — scoring

Runner component score'ları hesaplanır.

## Stage H — ranking

Runner'lar karşılaştırılır.

## Stage I — coupon generation

Leg candidate'ları global kupon kombinasyonlarına çevrilir.

## Stage J — API projection

Internal model client'ın tüketebileceği response'a dönüştürülür.

---

# 6. Failure taxonomy

NETWORK_ERROR

Source'a erişilemedi.

HTTP_ERROR

Source HTTP response'u beklenen success contract'ını sağlamadı.

HTTP_PARSE

HTTP response geldi ancak beklenen yarış yapısına çevrilemedi.

TJK_NO_RACES

Fetch/parse sonunda usable race bulunamadı.

SOURCE_DEGRADED

Bir enrichment source başarısız ancak pipeline devam ediyor.

DB_ERROR

Persistence operation başarısız.

AUTH_ERROR

Protected operation authorization boundary'sini geçemedi.

VALIDATION_ERROR

Request/domain invariant ihlal edildi.

SCORING_ERROR

Feature/score calculation tamamlanamadı.

COUPON_ERROR

Combination generation/optimization başarısız.

Bu sınıflar mümkün olduğunca log ve diagnostics'te birbirinden ayrılmalıdır.

---

# 7. Diagnostics strategy

Diagnostics'in amacı:

"çalışıyor mu?"

sorusundan daha derine inmektir.

İdeal diagnostic tree:

SYSTEM
├── runtime
├── database
├── program
├── TJK pipeline
├── experts
├── form
├── field signals
├── scoring
├── coupon engine
├── refresh state
└── versions

Her probe mümkün olduğunca:

status
reason
counts
timestamps
version
error

gibi machine-readable alanlar döndürmelidir.

Secret veya sensitive payload dönmemelidir.

---

# 8. Database interpretation

D1 tabloları yalnızca storage değildir; pipeline'ın zaman içindeki state'ini
temsil eder.

Tabloları incelerken üç sınıfa ayır:

## Source/domain tables

Program, race, runner ve source-derived veriler.

## Derived tables

Scoring, prediction, enrichment veya coupon gibi hesaplanmış state.

## Operational tables

Refresh state, health, snapshot metadata ve benzeri orchestration bilgileri.

Bir tablo için her zaman şu sorular sorulmalıdır:

1. Writer kim?
2. Reader kim?
3. Primary identity nedir?
4. Refresh policy nedir?
5. Stale olduğunda ne olur?
6. Silinirse yeniden üretilebilir mi?
7. Historical truth mü yoksa cache mi?

---

# 9. Refresh strategy

Refresh mekanizması request başına körlemesine external fetch yapmamalıdır.

Conceptually:

request
→ inspect refresh state
→ fresh?
   YES → existing state
   NO  → refresh attempt
          → success → persist new state
          → failure → fallback/degraded state

Bu model latency ve source instability'yi sınırlar.

---

# 10. Scoring interpretation

Final score tek başına açıklanabilirlik sağlamaz.

Mümkün olduğunca:

final score
= component contribution toplamı

olarak düşünülmelidir.

Bir runner'ın neden yükseldiğini anlamak için:

AGF contribution
expert contribution
form contribution
HP contribution
market contribution
weight/context contribution

ayrı görülebilmelidir.

Bu explainability diagnostic ve UI için değerlidir.

---

# 11. Coupon optimization

Kupon optimizasyonunun girdisi yarış başına candidate set'tir.

Naive yaklaşım:

her yarışın #1 atını seç.

Bu ucuz fakat kırılgandır.

Coverage yaklaşımı:

belirsiz ayaklarda alternatif ekle.

Fakat Cartesian product hızla büyür.

Örneğin:

2 × 3 × 2 × 1 × 4 × 2

kombinasyon sayısı 96'dır.

Dolayısıyla optimizer:

- candidate strength
- leg uncertainty
- upset potential
- total combination count
- budget/coverage

arasında denge kurmalıdır.

Global optimizer'ın varlık nedeni budur.

---

# 12. Security model

Protected endpoint:

request
→ configured admin credential var mı?
→ credential supplied mı?
→ credential valid mi?
→ operation permitted mi?

Herhangi kritik uncertainty:

DENY.

Token loglanmamalı veya diagnostics response'a konmamalıdır.

---

# 13. Logging strategy

Logging high-signal olmalıdır.

INFO örneği:

refresh başladı/bitti
snapshot değişti
coupon generation tamamlandı

WARN:

source unavailable
fallback kullanıldı
partial enrichment

ERROR:

DB operation failed
pipeline terminal failure
unexpected invariant

DEBUG:

parser decision
candidate details
diagnostic internals

Production log volume'unu büyütmemek için loop başına anlamsız INFO
yazılmamalıdır.

---

# 14. Debugging playbook

Bir kullanıcı "yarış görünmüyor" dediğinde doğrudan UI'dan başlanmamalıdır.

Sıra:

1. API request ulaşıyor mu?
2. route doğru mu?
3. program mevcut mu?
4. race count?
5. runner count?
6. refresh state?
7. TJK fetch?
8. parser sonucu?
9. persistence?
10. projection/filter?
11. client?

Kupon sorunu:

1. race data
2. runner scores
3. candidate generation
4. optimizer
5. constraints
6. persistence
7. API projection

Expert sorunu:

1. source health
2. fetch
3. parser
4. normalization
5. race mapping
6. persistence
7. consensus

---

# 15. Clean-code rules

Router orchestration yapar.

Repository persistence yapar.

Parser parsing yapar.

Scorer scoring yapar.

Optimizer optimization yapar.

Diagnostics observation yapar.

Bir function bunlardan birkaçını aynı anda yapıyorsa decomposition adayıdır.

Functions:

- tek responsibility
- erken return
- küçük dependency surface
- descriptive naming
- explicit error semantics

hedeflemelidir.

Magic string ve magic number merkezi constants/policy katmanına taşınmalıdır.

---

# 16. Change-impact map

TJK parser değişirse:

program
→ races
→ runners
→ enrichment mapping
→ scoring
→ coupon

etkilenebilir.

Scoring weights değişirse:

ranking
→ favorites
→ confidence
→ coupon candidates
→ historical comparison

etkilenebilir.

Coupon policy değişirse:

runner score değişmeyebilir fakat generated coupon değişebilir.

Router değişirse:

domain doğru çalışsa bile API inaccessible olabilir.

DB schema değişirse:

repository + diagnostics + migration + tests birlikte değerlendirilmelidir.

---

# 17. Test philosophy

Tests yalnız syntax kontrolü değildir.

Özellikle korunması gereken invariants:

- protected endpoints fail closed
- public endpoints auth yüzünden bozulmaz
- TJK usable races üretebilir
- empty/invalid source açık failure üretir
- scoring deterministic kalır
- weights expected total/contract'a uyar
- coupon optimizer constraint'leri korur
- historical snapshot yeniden hesaplanmaz
- diagnostics business state'i mutate etmez

---

# 18. Operational checklist

Production problemi geldiğinde:

HEALTH
→ AUTH
→ ROUTER
→ DB
→ REFRESH STATE
→ TJK
→ ENRICHMENT
→ SCORING
→ COUPON
→ RESPONSE

sırasıyla ilerle.

Bu sıra downstream symptom ile upstream root cause'u karıştırmayı azaltır.

---

# 19. Mental model

Two Horse'u tek bir büyük uygulama gibi değil birbirine bağlı pipeline'lar
olarak düşün:

INGESTION PLANE

TJK/source → parse → normalize → store

ENRICHMENT PLANE

experts + form + field + market

DECISION PLANE

features → scoring → ranking → optimizer

SERVING PLANE

router → API → client

CONTROL PLANE

auth + refresh state + versions + diagnostics + logging

Bu ayrım sistem büyüdükçe hangi problemin hangi katmana ait olduğunu anlamanın
en önemli araçlarından biridir.

---

# 20. Golden rule

Bir production failure için cevap yalnızca:

"endpoint 500 verdi"

olmamalıdır.

Hedef:

hangi subsystem,
hangi operation,
hangi input/state,
hangi failure class,
hangi fallback,
hangi model/policy version

sorularına cevap verebilmektir.

Bu nedenle clean architecture, diagnostics, structured logging, versioning ve
tests birbirinden bağımsız özellikler değil aynı operability stratejisinin
parçalarıdır.

---

# 21. Source-code reading philosophy

Bu projede bir TypeScript dosyasını yalnız dosya adına göre anlamaya çalışma.

Her dosya için şu 8 soruyu sor:

1. Bu dosyanın bounded responsibility'si ne?
2. Kim bunu çağırıyor?
3. Bu dosya kimi çağırıyor?
4. Hangi DB tables'a dokunuyor?
5. Hangi external source'a dokunuyor?
6. Hangi invariantı koruyor?
7. Fail olursa downstream'de ne bozulur?
8. Hangi diagnostic endpoint bunu gözlemleyebilir?

Bu 8 soru bütün kod tabanının zihinsel haritasını oluşturur.

---

# 22. TJK pipeline derin modeli

TJK pipeline yalnız "HTML parse" değildir.

Katmanlar:

transport
→ response validation
→ content interpretation
→ race discovery
→ runner extraction
→ normalization
→ canonical persistence
→ reconciliation
→ stale removal

Her katmanda farklı failure class vardır.

Transport başarısızsa:

source'a hiç ulaşılamadı.

Response geldi ama race yoksa:

transport başarılı,
semantic extraction başarısız veya source gerçekten boş.

Bu ikisi diagnostic olarak ayrı tutulmalıdır.

Reconciliation aşaması özellikle önemlidir.

Bugünün canonical card'ı değiştiğinde eski city/race state'in sessizce kalması yanlış prediction üretir.

---

# 23. Canonical program authority

Canonical program şu alanların authoritative kaynağıdır:

race identity
race number
city
runner identity
horse number
race start time
TJK explicit metadata

Expert veya market source canonical identity yaratmamalıdır.

Örneğin expert source "horse 5" diyorsa önce canonical runners içindeki horse 5'e map edilir.

Map yoksa source row canonical truth haline gelmez.

---

# 24. Expert semantic model

Expert kaynaklar binary vote sistemi değildir.

Semantic labels örneğin:

banko
tek
favori
ilk şans
rakip
ihmal edilmemeli
sürpriz
bomba

gibi farklı conviction seviyeleri taşıyabilir.

Normalize katmanı source-specific ifadeyi internal semantic strength'e dönüştürür.

Consensus bu normalize edilmiş source opinions üzerinden hesaplanmalıdır.

Source count ile opinion strength aynı kavram değildir.

---

# 25. Form modeli

Form yalnız son yarış sıralaması değildir.

Form pipeline potansiyel olarak şunları temsil eder:

recent outcomes
consistency
direction/trend
recency
surface/context relevance

Raw history ile derived form score ayrılmalıdır.

Raw history yeniden hesaplanabilir source evidence'dır.

Form score ise model interpretation'dır.

---

# 26. HP ve weight

HP gibi canonical numeric attributes doğrudan normalize edilmeden component score olarak kullanılmamalıdır.

Weight etkisi de absolute "az kilo iyidir" gibi tek boyutlu rule olmamalıdır.

Race context ve population distribution önemlidir.

Dokümanda weight bir model component olarak görülür; gerçek production transformation source code'daki implementation'dır.

---

# 27. Market movement

AGF current value ve AGF trajectory ayrıdır.

Örnek:

Horse A

08:00 AGF 8
10:00 AGF 12
12:00 AGF 18

Horse B

08:00 AGF 18
10:00 AGF 18
12:00 AGF 18

İki at current AGF olarak aynı seviyeye yaklaşabilir fakat market momentum farklıdır.

Snapshot table'ın amacı bu zaman boyutunu korumaktır.

---

# 28. Scoring weight normalization

Configured feature weights toplamı 100 olabilir.

Fakat bütün signals her runner için mevcut olmayabilir.

Eksik signal'a sıfır score verip configured weight'i korumak yanlış penalty yaratabilir.

Bu nedenle available-weight renormalization kullanılır.

Örnek:

AGF 25
Expert 22
Form 18
HP 15
Market 10
Weight 5
Field 5

Sadece:

AGF
Form
HP
Weight

mevcut.

Available weight:

25 + 18 + 15 + 5 = 63

Effective AGF:

25 / 63

Effective Form:

18 / 63

vs.

Final score mevcut evidence üzerinde normalize edilir.

Confidence ise "feature completeness" bilgisi taşır.

---

# 29. Score vs confidence

Score:

Mevcut evidence altında runner strength.

Confidence:

Score'u destekleyen feature coverage miktarı.

İki runner aynı score'a sahip olabilir fakat confidence farklı olabilir.

Bu kupon optimizer için önemlidir.

High score + low confidence

ile

high score + high confidence

aynı risk profili değildir.

---

# 30. Probability transform

Raw model score doğrudan calibrated win probability değildir.

Race-relative transform yapılır.

Best score baseline alınır.

Exponential transform düşük score farklarını smooth eder.

Temperature modelin sharpness parametresidir.

Düşük temperature:

top runner probability daha keskin ayrılır.

Yüksek temperature:

probability daha flat olur.

Bu nedenle temperature sıradan constant değil behavior policy'dir.

---

# 31. Coupon combinatorics

Altılı kupon maliyeti her leg selection count'ın çarpımıdır.

Örnek:

Leg1 3
Leg2 2
Leg3 1
Leg4 4
Leg5 2
Leg6 3

Combinations:

3×2×1×4×2×3 = 144

Unit 1.25 TL ise:

180 TL

Bir leg'e yalnız +1 horse eklemek tüm diğer legs ile Cartesian multiplication yaratır.

Bu yüzden greedy expansion kolayca suboptimal olur.

---

# 32. Global optimizer rationale

Greedy:

en yüksek marginal horse'u ekle

yaklaşımı local gain'e bakar.

Ama gerçek marginal cost:

other legs selection counts

ile çarpılır.

Global optimizer bütün legal count combinations içinde budget constraint altında survival objective'i değerlendirir.

Meet-in-the-middle yöntemi search space'i iki parçaya bölerek kombinasyon maliyetini azaltır.

Bu algoritmanın amacı:

budget altında highest modeled survival.

Budget'ı tam harcamak secondary outcome olabilir; primary objective değildir.

---

# 33. Six-fold window lifecycle

Window metadata:

race_date
city
sixfold_number
start_race
end_race
source
updated_at

source şu tiplerden biri olabilir:

tjk-program
canonical-program
fallback-derived

Official explicit metadata varsa source authority daha yüksektir.

Reconciliation stale row'ları current canonical card ile uyumlu tutar.

---

# 34. Coupon snapshot lifecycle

Generation zamanı:

race card mevcut
→ sixfold window resolve
→ runner scores
→ probability
→ optimize
→ response

POST ise ayrıca:

pre-race timing validate
→ snapshot identity
→ idempotent persistence

Race başladıktan sonra oluşturulan kupon prediction olarak gösterilebilir olsa bile historical pre-race evaluation dataset'ine yazılmamalıdır.

---

# 35. Learning candidate lifecycle

Candidate:

race başlamadan capture edilmiş feature state.

Promotion:

Race başladıktan sonra yalnız pre-race captured candidate valid historical example olur.

Result attach:

Official result geldiğinde label eklenir.

Evaluation:

Base vs learned model karşılaştırılır.

Gate:

Yeterli sample ve improvement yoksa learned production adjustment açılmaz.

Bu architecture overfitting ve leakage riskini azaltır.

---

# 36. Temporal leakage

En tehlikeli ML buglarından biridir.

Örnek:

Race starts_at 14:00

Feature capture 14:05

Bu row prediction anında mevcut olmayan information içerebilir.

Bu nedenle:

captured_at < starts_at

database invariant seviyesinde izlenir.

Bu invariant bozulursa geçmiş accuracy metrics güvenilir değildir.

---

# 37. Official result semantics

Official result:

label

özelliğindedir.

Prediction input değildir.

Finish position veya winner identity ancak yarış sonrasında learning/evaluation katmanına bağlanır.

Result ingestion'ın scoring input pipeline'a dependency oluşturması architecture violation sayılmalıdır.

---

# 38. Scheduled pipeline

Scheduled operations birbirini tamamen crash ettirmemelidir.

Örnek sequence:

program refresh
experts refresh
field refresh
learning capture
learning promotion
history finalize
official results
coupon evaluation
retention cleanup

Observed wrapper sayesinde tek operation failure loglanır ve diğer operasyonların çalışmasına izin verilebilir.

Bu resilience için önemlidir.

---

# 39. Logging interpretation

Structured log field örnekleri:

timestamp

UTC log time.

level

debug/info/warn/error.

message

Stable event name.

operation

Pipeline/function-level semantic operation.

durationMs

Latency.

route

HTTP route.

city

Race city context.

raceNumber

Race context.

error

Sanitized error.

Log message text yerine stable event name kullanmak query/aggregation için daha iyidir.

---

# 40. D1 table ownership model

Her table için dört kategori düşün:

Canonical

TJK program identity.

Enrichment

Expert, market, field, form.

Learning/evaluation

Snapshots, labels, model state.

Operational

Refresh/source runtime state.

Bir table'ın ownership'i belirsizse code smell vardır.

---

# 41. Table lifecycle questions

Her table için:

Who writes?

Who reads?

What is identity?

Can it be rebuilt?

Is it immutable historical evidence?

Is it mutable cache?

What makes it stale?

What diagnostic exposes it?

Bu sorular docs ve incident response için zorunludur.

---

# 42. Router clean-code target

Router şunları yapmalı:

method/path match
auth
parameter extraction
service dispatch
response

Router şunları yapmamalı:

scrape HTML
calculate model score
run optimizer internals
write large SQL business queries
perform learning math

Bu ayrım okunabilirliğin temelidir.

---

# 43. Repository clean-code target

Repository:

SQL ownership.

Service:

business orchestration.

Parser:

source interpretation.

Scorer:

mathematical scoring.

Optimizer:

search/selection.

Diagnostics:

read-only observability.

Bu boundaries merge edilirse complexity hızla artar.

---

# 44. Debug API as architecture map

Diagnostic endpoints yalnız support tool değildir.

Aynı zamanda architecture'nın runtime projection'ıdır.

overview

system-level.

card

canonical program-level.

race

race aggregate-level.

runner

entity-level.

table

storage-level.

Bu hierarchy projenin bounded layers'ını aynalar.

---

# 45. Incident example — horse prediction unexpectedly low

1. runner endpoint

Canonical row var mı?

2. experts

Expert opinions missing mi?

3. market

AGF snapshot stale mi?

4. field

Field score var mı?

5. data-quality

City-wide issue mi tek runner issue mu?

6. scoring-config

Weights/version beklenen mi?

7. model diagnostics

Model behavior mı değişmiş?

Bu sıra score function'a körlemesine patch atmayı önler.

---

# 46. Incident example — coupon too expensive

1. requested budget

2. unitPriceTl

3. multiplier

4. leg horse counts

5. Cartesian combination

6. optimizer target budget

7. final totalTl <= budgetTl invariant

Combination count doğruysa bug pricing değil strategy olabilir.

---

# 47. Incident example — no expert data

runner.experts=[]

tek başına parser bug kanıtı değildir.

Kontrol:

source_registry enabled?

source health?

expert current card mapping?

race identity match?

horse_number match?

current date source publication var mı?

Bu zincir tamamlanmadan parser değiştirilmez.

---

# 48. Incident example — learning accuracy impossible high

İlk kontrol:

invalidCaptureTiming.

Sonra:

result time.

candidate captured_at.

promotion timing.

historical feature source.

Official result leakage varsa bütün metric invalidate edilir.

---

# 49. Engineering rule

Bir production fix uygulanmadan önce:

symptom
root cause
owning subsystem
minimum-risk change
invariant impact
test
diagnostic proof

belirlenmelidir.

---

# 50. Final mental picture

Two Horse backend beş plane olarak okunabilir:

DATA PLANE

TJK + external sources + D1.

FEATURE PLANE

expert + form + HP + market + weight + field.

DECISION PLANE

scoring + probability + optimizer.

LEARNING PLANE

snapshot + result + evaluation + gate.

CONTROL PLANE

router + auth + diagnostics + logs + versions + refresh state.

Bu beş plane birlikte sistemi oluşturur.

---

# 51. Expert source health: effective status vs raw status

Bir source için tek bir "healthy" kolonu yeterli değildir.

processSource'un birçok non-throwing çıkış yolu vardır:

- kart bugün yayınlanmamış
- her extraction denemesi access-restricted
- extraction çalıştı ama kullanılabilir pick üretmedi

Bu yollar eskiden health_status'u değiştirmiyordu.

Sonuç: üç gün önce gerçek bir başarı yaşamış bir source, bugün hiçbir
şey üretmemesine rağmen "healthy" görünüyordu.

markExpertOutcome bu çıkış yollarının her birinde gerçek durumu yazar:

blocked (access-restricted)
parse-error (extraction denendi, çıkarılamadı)
no-picks-today (kart yok, ama source'un kendisi bozuk değil)

last_success_at ve content_hash bu outcome'lardan etkilenmez — onlar
yalnızca source gerçekten katkı sağladığında güncellenir.

## Effective status

Raw health_status tek başına yanıltıcı olabilir: bir source bir kez
"healthy" yazmış ve bir daha hiç kontrol edilmemiş olabilir.

deriveEffectiveSourceStatus şu kuralı uygular:

health_status = healthy VE bugün kontrol edilmemiş → effectiveStatus = stale

Diğer her durum (no-picks-today dahil) olduğu gibi kalır — no-picks-today
dürüst bir sonuçtur, "bozuk" değildir ve staleSources/failedSources
sayaçlarına girmez.

summarizeExpertSourceHealth bunu tüm enabled source'lar için hesaplar ve
availableSources / contributingSources / staleSources / failedSources
özetini üretir.

/api/debug/health ve /api/debug/sources bu özeti kullanır — artık
degradedSources sayısı raw kolon değil, effective status'tan gelir.

---

# 52. Form/HP eksikliği: gerçek boşluk mu, beklenen boşluk mu

~%30 form ve ~%33 HP eksiklik oranı ilk bakışta parser regresyonu gibi
görünür. Canlı D1 incelemesi iki farklı, zararsız TJK gerçeğini ortaya
çıkardı:

1. Debut/maiden yarış — o yarıştaki HER runner'da form ve HP birlikte
   eksik. Binary desen: ya hepsi ya hiçbiri.

2. Kısa geçmişli at — recent_form_raw yalnızca 1-2 karakter (örn. "7")
   olan bir atın TJK henüz handikap puanı atamamış olması normaldir.

Gerçek bir regresyon farklı görünür: bazı runner'larda eksik, bazılarında
yok, ortak bir açıklaması olmadan — dağınık bir alt küme.

classifyRaceFieldCoverage bu ayrımı yapar:

missingCount = 0            → full-coverage
missingCount >= totalRunners → likely-not-published  (tüm yarış — 1. senaryo)
0 < missingCount < total     → partial-gap            (dağınık — gerçek sinyal)

HP için ek bir incelik var: unexplainedMissingHp yalnızca
recent_form_raw uzunluğu 2'den büyük olan (yani gerçek yarış geçmişi
olan) runner'ların HP eksikliğini sayar — 2. senaryoyu (kısa geçmiş)
alarm listesinden çıkarır.

/api/debug/data-quality artık raceFieldCoverage + unexplainedGaps
alanlarını döner: bir sonraki gerçek regresyon, korkutucu görünen ama
zararsız bir toplam yüzdenin arkasına gizlenmek yerine görünür olur.

---

# 53. Field signal: kısmi kapsamın haksız avantaj yaratması

Bir runner'ın kendi field_score'unun null olması zaten doğru işleniyordu
(bölüm 28'deki available-weight renormalization sayesinde) — eksik
sinyal sıfır olarak cezalandırılmıyordu.

Ama gözden kaçan farklı bir sorun vardı: aynı yarışta yalnızca 1-2
runner'ın field sinyali varken diğer 8-9'unda hiç yoksa, o 1-2 runner
diğerlerinin hiç sahip olmadığı bir skorlama boyutunu taşıyordu — bu
adil bir karşılaştırma değil, çünkü kim daha iyi at olduğuyla ilgisi
yok.

suppressPartialFieldCoverage race-wide bir eşik uygular:

coveredRunners / totalRunners < 0.5 → o yarıştaki HER runner'ın
field_score'u null'a çekilir — yalnızca eksik olanların değil, zaten
sahip olanların da.

>= 0.5 kapsam varsa hiçbir şey değişmez; sahip olanlar sahip kalır,
olmayanlar zaten null'dı.

fieldSignal.tjkScore / expertScore ham veri olarak diagnostics için
kalır — yalnızca skorlamaya giren `score` alanı bastırılır.

Canlıda doğrulandı: aynı gün içinde bazı yarışlar %0 kapsamda (hepsi
null), bazıları %75-91 kapsamda (gerçek skorlar) — ara bir durum
(örneğin %20 kapsam açıkta kalmış) gözlenmedi.

/api/debug/data-quality artık fieldSignalCoverage +
partialFieldCoverageRaces alanlarını da döner.

---

# 54. Üç ayrı öğrenme/kalibrasyon mekanizması

"Öğrenme" tek bir şey değildir — sistemde üç bağımsız, farklı
granülaritede, farklı gate'lere sahip mekanizma vardır.

## 54.1 Uzman kaynak güvenilirlik kalibrasyonu

Her source'un pozitif dediği (banko/favori/güçlü/vs) atların gerçek
kazanma/ilk-3 oranı, TÜM runner'ların global ortalamasıyla kıyaslanır.

relativeQuality = 0.65 × (winRate / globalWinRate)
                + 0.35 × (top3Rate / globalTop3Rate)

reliability = clamp((sampleSize - 29) / 121, 0, 1)   → 150 örnekte tam güven

adjustment = clamp((relativeQuality - 1) × 0.15 × reliability, -0.15, 0.15)

multiplier = 1 + adjustment

Bu multiplier, o source'un her tahmininin base_weight'ine çarpılır —
expertConsensus'a, oradan da modelScore'un "expert" bileşenine (ağırlık
%22) girer. Her an aktif, gate MIN_SAMPLES yok — sadece reliability
küçük örneklerde etkiyi zaten küçültüyor.

## 54.2 Uzman kategori kalibrasyonu

Aynı mantık, ama kıyaslama global değil kategori-içi: bir source'un
"rakip" pickleri, TÜM source'ların "rakip" picklerinin ortalamasıyla
kıyaslanır — "banko" ile "rakip"i aynı çıtaya koymamak için.

Her kategori kendi MIN_SAMPLES eşiğine sahiptir:

banko 15, favori 25, güçlü 25, yıldız 20, rakip 30, sürpriz 30

Eşik altında multiplier = 1 (etkisiz). Üstünde reliability
(sampleSize - minSamples + 1) / 100 ile büyür, maksimum ±%12.

Bir source genelde iyi ama belirli bir kategoride sıradan olabilir —
bu mekanizma bunu ayrı ayrı yakalar.

### 54.2.1 İşlenmiş örnek — afa / "rival"

Canlı veri (2026-08-30): afa'nın "rival" pickleri 69 örnek, kazanma
%21.74, ilk-3 %47.83. Tüm kaynakların "rival" ortalaması (123 örnek):
kazanma %17.07, ilk-3 %47.15.

**1. Oranlar** — her metrik kendi ortalamasına bölünür (oran > 1 =
ortalamadan iyi):

```
winRatio  = 0.2174 / 0.1707 = 1.2735
top3Ratio = 0.4783 / 0.4715 = 1.0144
```

**2. Ağırlıklı ortalama** — kazanma tahmini daha değerli/daha az
gürültülü olduğu için %65 pay alır, ilk-3 küçük örneklerdeki
gürültüyü dengeleyen ikincil sinyal olarak %35 pay alır:

```
kalite = 0.65 × 1.2735 + 0.35 × 1.0144
       = 0.8278 + 0.3550
       = 1.1828   (→ ortalamadan %18.28 daha iyi)
```

**3. Güven (reliability)** — minSamples("rival") = 30. 69 örnek bu
eşiğin 39 üstünde; +1 eşiği tam karşılayan örnek sıfır güvenle
başlamasın diye; /100 çünkü "minSamples'in 100 üstünde tam güven"
kuralı var (yani 30+100=130 örnekte %100):

```
güven = (69 - 30 + 1) / 100 = 40/100 = 0.40
```

**4. Düzeltme** — (kalite-1) sapmayı sıfır-merkezli hale getirir;
×0.12 mekanizmanın MUTLAK tavanıdır (sapma ne kadar büyük olursa
olsun bu kategori-kalibrasyonu ağırlığı en fazla %12 değiştirebilir);
×güven o tavanın ne kadarının gerçekten hak edildiğini belirler:

```
düzeltme = (1.1828 - 1) × 0.12 × 0.40
         = 0.1828 × 0.12 × 0.40
         = 0.0088   (round, 4 ondalık)
```

**5. Çarpan:**

```
çarpan = 1 + 0.0088 = 1.0088
```

afa'nın rival oyu, konsensüs hesaplanırken diğer kaynaklara göre
**binde 8.8 daha ağır** sayılır — küçük ama gerçek, ve iki ayrı
mekanizma (sabit tavan + örnek-sayısına-göre-güven) sayesinde asla
tek bir iyi/kötü seriden abartıya kaçamaz.

### 54.2.2 Neden ±%12 (kaynak seviyesindeki ±%15'ten küçük)?

Bu bilinçli bir sıralama, hata değil: kaynak-seviyesi kalibrasyon
(54.1) bir source'un TÜM picklerine (yüzlerce örnek olabilir)
dayanır — daha geniş, daha az gürültülü bir sinyal, o yüzden ±%15
tavanı var. Kategori-seviyesi kalibrasyon (54.2) aynı source'un TEK
bir kategorisine (örn. sadece "rival" pickleri) dayanır — daha dar,
doğası gereği daha gürültülü bir dilim, o yüzden tavanı daha düşük
(±%12) tutulmuştur: **ne kadar ince taneli (granular) bir sinyalse,
tavanı o kadar düşük olmalı.**

Bu iki sayı için literatürde tek bir "endüstri standardı" yoktur —
bu, published bir ML metodu değil, sistemin kendi empirical-shrinkage
tasarımıdır. %12 seçimi şu üç gözlemle savunulabilir:
(1) reliability rampası zaten çoğu durumda tavana hiç yaklaşmıyor —
gerçek etkiler genelde tavanın çok altında kalıyor (bu örnekte olduğu
gibi: tavan %12 iken gerçekleşen etki sadece %0.88);
(2) veri hacmi hâlâ küçük (toplam ~200 etiketlenmiş yarış) — büyük
bir tavan, erken/şanslı bir seriyi kalıcı ağırlık avantajına
çevirebilir;
(3) kaynak-seviyesi tavanın (%15) altında kalması gereken bir sayı
olduğu için üst sınırı zaten %15'tir.

Sonuç: %12 düşük değil, **kasıtlı ve tutarlı şekilde muhafazakâr** —
gerçek dünya sonuçlarıyla doğrulama imkânı olmadan (backend
kapatılacağı için) bu turda değiştirilmedi. İleride daha fazla
etiketlenmiş yarış birikirse ve gerçek performans verisiyle "%12
gerçekten çok mu düşük" sorusu ölçülebilirse, tek satırlık bir
değişiklikle (SIXFOLD_CALIBRATION_CONFIG'teki maxTemperatureShift
gibi, ama bu expert-category.ts'teki sabit) yükseltilebilir.

## 54.3 At/jokey/çift bağlam öncülleri (context priors)

En granüler seviye: "bu at, bu şehir + bu pist + bu mesafe bandında
tarihsel olarak nasıl performans gösterdi."

Gruplama entity_key + city + track + distance_band üzerinden yapılır —
yalnızca "at" değil, aynı koşul altındaki geçmiş.

minSamples: at 6, jokey 20, çift (at+jokey) 5.

Şu an (bu yazının yazıldığı tarihte) HİÇBİR entity bu eşiği
geçmiyor — en yüksek örnek sayısı at için 2, çift için 2, jokey için
12/20. Sebep bug değil: aynı atın aynı şehir+pist+mesafe kombinasyonunda
6 kez koşması, birkaç haftalık veri geçmişiyle istatistiksel olarak
neredeyse imkansız.

Bu mekanizma production'da learningAdjustment olarak (frontend'de
"🧠 Learning etkisi") gösterilir — şu an neredeyse her at için +0.0,
ve bu doğru/dürüst bir gösterimdir, mekanizma bozuk olduğu için değil,
henüz yeterli tekrar eden veri birikmediği için.

## Ortak tasarım deseni

Üçü de aynı iskeleti paylaşır:

MIN_SAMPLES eşiği altında etkisiz (multiplier=1 veya adjustment=0)
Eşik üstünde reliability lineer büyür
Maksimum etki her zaman sabit bir tavana clamp'lenir

Bu, "yetersiz veriyle production'ı bozma" ilkesinin (bkz. bölüm 35,
"gate") somut, tekrar eden uygulamasıdır.

---

# 55. Sixfold kupon değerlendirmesinin tamlığı

evaluatePendingSixFoldCoupons her bacağın kazananını
learning_races/learning_runner_features üzerinden çözer.

Sorun: bu tablo yalnızca gerçekten ingest edilmiş toplantılar için
doldurulur. Bir toplantının learning_races'e hiç girmemiş olması
(ingestion hiç başlamamış, ya da satır daha önce temizlenmiş) o
kuponun ASLA çözülemeyeceği anlamına gelir — ama eski kod bunu sonsuza
kadar sessizce yeniden denemeye devam ediyordu.

Canlı kanıt: production'daki 3 bekleyen sixfold snapshot'ın hepsi
aynı toplantıya (İstanbul, 2026-08-20) aitti ve bu toplantının
learning_races, learning_runner_features, official_result_runs
tablolarında SIFIR satırı vardı — ingestion o toplantı için hiç
başlamamıştı.

Çözüm: SIXFOLD_STALE_AFTER_DAYS (5 gün) sonra hâlâ çözülememiş bir
snapshot, tekrar deneme sayısına değil yalnızca kendi yaşına bakılarak
unresolved_reason = 'RESULTS_UNAVAILABLE' ile işaretlenir ve pending
sorgusundan düşer. Yavaş ingest eden bir toplantı asla cezalandırılmaz —
yalnızca gerçekten hiç çözülemeyecek olan işaretlenir.

/api/debug/pipeline → sixfoldCouponHealth: evaluated/pending/
unresolved/overdueUnclassified. overdueUnclassified > 0 ise cron
çalışmıyor demektir — sonuçların yavaş gelmesi değil.

---

# 56. Sixfold olasılık öz-kalibrasyonu

optimizeSixFoldCoupons'un softmax'ı (runner score'unu probability'ye
çeviren fonksiyon) bir "temperature" parametresi kullanır — sabit 14
değeriyle, hiç kalibre edilmemiş olarak.

Bölüm 30'da bu parametrenin "sıradan bir constant değil, behavior
policy" olduğu söyleniyordu — ama gerçekte hiçbir politika onu
yönetmiyordu. Kuponun gerçek sonuçlarından hiçbir geri besleme yoktu.

Şimdi var:

Her değerlendirilen sixfold bacağı bir kalibrasyon örneğidir:
tahmin edilen coverageProbability + gerçekte tuttu mu (0/1).

recalibrateSixFoldProbabilities bu örnekleri toplar:

bias = actualHitRate - predictedAvgCoverage

Negatif bias (gerçek < tahmin) → overconfident → temperature YÜKSELİR
→ dağılım düzleşir → aynı seçim için gelecekte daha düşük/dürüst
coverageProbability raporlanır VE optimizer aynı hedef kapsamı
yakalamak için bacak başına doğal olarak daha fazla at seçer.

Pozitif bias → underconfident → temperature DÜŞER → dağılım keskinleşir.

Gate: SIXFOLD_CALIBRATION_CONFIG.minSamples (50) altında etkisiz; 300 örnekte tam
güven; maksimum kayma ±%30.

Bu yazının yazıldığı tarihte sistemde toplam 6 sixfold kupon üretilmiş
(3'ü değerlendirilmiş) — yani kalibrasyon şu an inert (varsayılan
temperature'da). Gerçek kullanım hacmi arttıkça kendiliğinden devreye
girer — bölüm 54'teki üç mekanizmayla aynı temkinli desen.

/api/debug/pipeline → sixfoldCalibration: sampleCount, predictedAvgCoverage,
actualHitRate, temperature, status.

---

# 57. Mobil payload disiplini

/api/today'nin runner payload'ının %27'si shadowModelScore'du —
production learning gate'i geçmemiş "shadow" skorun tam bir kopyası,
sunucu-içi karşılaştırma için var olan, hiçbir client'ın okumadığı bir
alan. toPublicMeetings artık bunu da expertPredictions gibi süzüyor.

/api/history hiç böyle bir süzgeçten geçmiyordu — race_history'nin ham
snapshot_json'ı, source_key ve comment dahil ham expertPredictions
satırlarını doğrudan public'e servis ediyordu. toPublicHistory bunu
kapatır — ama expertPredictionCount'u (kaç uzman satırı olduğunu, kim
olduklarını değil) korur, çünkü Android History ekranı bu sayıyı
gösterir. Sayıyı silip array'i kaldırmak bu ekranı sessizce kırardı —
tam da olan buydu, bir sonraki turda bulunup düzeltildi.

/api/history artık limit/offset ile sayfalanıyor (varsayılan 20,
maksimum 50) — tüm 2 günlük pencereyi her seferinde döndürmek yerine.

/api/debug/db/counts artık _cf_KV ve d1_migrations gibi D1'in kendi
iç tablolarını listelemiyor — bunlar validIdentifier'dan geçiyordu ama
uygulamanın veri modeliyle ilgisi yok.

---

# 58. Refresh cadence: maliyet politikası olarak

expertCheckIntervalMs, yarışa kalan süreye göre bir tier tablosu
kullanır — sabit if/else zinciri değil, tek bir dizi:

>2 saat  → 360 dk (6 saat)
2-1 saat → 15 dk
1 saat-30 dk → 10 dk
<30 dk   → 5 dk

Her check hem Workers AI (extraction) hem Browser Rendering (puppeteer/
scrape basamağı) tüketebilir — ikisi de faturalanır. Yarışa uzakken
sık kontrol hiçbir tazelik kazandırmaz; bir source'un yayınladığı
içerik saatler içinde anlamlı şekilde değişmez.

6 saatlik tier iki kısıt arasında bir denge: "yarışa 2 saatten uzakken
hiç kontrol etme" maliyeti en aza indirir ama sabahtan geç yayınlanan
bir kartın saatlerce keşfedilmemiş kalmasına yol açabilir — bu
uygulamanın temel değeri günün uzman tahminlerini göstermek, yalnızca
son 2 saatte açanlara değil. 6 saat, günde birkaç kontrol garantiler.

Bu tablo aynı zamanda expertFailureBackoffMs ile birlikte çalışır:
art arda başarısız bir source, kendi ayrı backoff'una girer (15/30/60
dk, yarışa yakınken daha kısa tavanlı) — bozuk bir source her cron
tick'inde yeniden denenmez.

---

# 59. Diagnostics yüzeyi — 2026-08 eklemeleri

/api/debug/health

degradedSources artık effectiveStatus'tan (bölüm 51).

/api/debug/data-quality

raceFieldCoverage, unexplainedGaps (bölüm 52)
fieldSignalCoverage, partialFieldCoverageRaces (bölüm 53)

/api/debug/pipeline

sixfoldCouponHealth (bölüm 55)
sixfoldCalibration (bölüm 56)

/api/debug/db/counts

_cf_KV ve d1_migrations artık filtreleniyor (bölüm 57)

Bu alanların hepsi mevcut endpoint'lere eklendi — yeni bir endpoint
açılmadı. Diagnostics yüzeyini küçük tutma ilkesi (bölüm 2.4) korunuyor.

---

# 60. Güncel durum notu

Bu bölümler (51-60), production fix planının Part 6-12'sini ve onu
takip eden ek işi (field score açıklaması, üç öğrenme mekanizmasının
derinlemesine belgelenmesi, sixfold öz-kalibrasyonu, refresh cadence
maliyet ayarı) belgeler.

Bilinen, kasıtlı olarak dokunulmamış durumlar:

horse_form_history / horse_form_refresh_state — kodu yazılmış,
hiçbir cron'a bağlanmamış, hiçbir yerde okunmuyor. Zararsız (hiç
çalışmadığı için sıfır maliyet) ama tamamlanmamış — ayrı bir karar
gerektirir.

/api/today hâlâ ~827KB (hedef <400KB) — shadowModelScore kaldırma
güvenli bir kazançtı; daha fazlası liste/detay endpoint ayrımı
gerektirir, bu da mobil app'in veri sözleşmesini değiştirir.

Bölüm 50'deki beş plane modeli hâlâ geçerli; bu eklemeler o modelin
FEATURE PLANE (bölüm 51-53), LEARNING PLANE (bölüm 54, 56) ve CONTROL
PLANE (bölüm 55, 57-59) katmanlarını derinleştirir, değiştirmez.
