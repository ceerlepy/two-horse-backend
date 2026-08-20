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
