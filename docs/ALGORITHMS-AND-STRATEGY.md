# Algorithms and Strategy

## Scoring

Her runner farklı feature family'lerinden sinyal alır.

Conceptual:

SCORE(horse) =
Σ normalized_feature_i(horse) × weight_i

Ancak production implementasyonunda gerçek weights ve transformations kodun
kendisidir; bu belge onları override etmez.

## Ranking

Score'lar race içindeki runner'ları karşılaştırmak için kullanılır.

Absolute score ile relative race strength aynı kavram değildir.

## Confidence

Confidence yalnız final score olmamalıdır.

Top candidates arasındaki separation ve available evidence miktarı gibi
unsurlar da belirsizliği etkileyebilir.

## Expert consensus

Expert vote bir feature'dır.

Consensus yüksek olması certainty'yi artırabilir ancak diğer signals'ı
otomatik olarak geçersiz kılmaz.

## Form

Recent historical performance future outcome için noisy signal'dır.

Normalization yapılmadan farklı race context'leri doğrudan karşılaştırılmamalıdır.

## Market / AGF

Market collective information taşır fakat modelin tek kaynağı değildir.

## Coupon optimization

Amaç yalnız strongest horse seçmek değil total ticket içinde risk/coverage
optimizasyonudur.

Per-leg uncertainty arttığında additional candidate'ın marginal value'su
artabilir.

Combination explosion:

choices(1)
× choices(2)
× ...
× choices(6)

Bu nedenle candidate expansion kontrollü olmalıdır.

## Versioning

Model behavior değişikliğinde version bump geçmiş/new prediction ayrımını
korur.

Model, learning ve coupon policy ayrı değişebildiği için ayrı version
dimensions değerlidir.
