# Two Horse Database Guide

D1 state'i incelerken tablo isimlerini ezberlemek yerine ownership ve lifecycle
üzerinden düşün.

Her tablo için cevaplanması gerekenler:

| Question | Meaning |
|---|---|
| Writer | Hangi service/pipeline yazıyor? |
| Reader | Kim tüketiyor? |
| Identity | Row'u benzersiz yapan nedir? |
| Freshness | Ne zaman stale olur? |
| Rebuildable | Source'tan tekrar üretilebilir mi? |
| Historical | Geçmiş gerçeği mi temsil ediyor? |
| Operational | Pipeline control state'i mi? |

## refresh_state

Pipeline refresh orchestration bilgisidir.

Diagnostic değeri yüksektir çünkü upstream pipeline'ın:

- son attempt
- son success
- failure/degraded state

gibi durumlarını anlamaya yardımcı olur.

## Program/race/runner state

TJK ingestion'ın normalized output'udur.

Runner yoksa scoring'den önce ingestion/mapping araştırılır.

## Derived state

Score/prediction/coupon gibi hesaplanmış sonuçların source input ve
model/policy version ile ilişkisi korunmalıdır.

## Historical state

Geçmiş prediction mümkünse immutable snapshot mantığında değerlendirilmelidir.
Bugünkü modelle sessizce yeniden üretmek geçmiş model performansını bozar.
