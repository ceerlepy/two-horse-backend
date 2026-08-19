ALTER TABLE source_registry ADD COLUMN source_type TEXT NOT NULL DEFAULT 'editorial';
ALTER TABLE source_registry ADD COLUMN base_weight REAL NOT NULL DEFAULT 1.0;
ALTER TABLE source_registry ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;

ALTER TABLE expert_predictions ADD COLUMN is_rival INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expert_predictions ADD COLUMN is_surprise INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expert_predictions ADD COLUMN is_avoid INTEGER NOT NULL DEFAULT 0;

-- Keep old/unverified sources for history, but do not actively scrape them.
UPDATE source_registry
SET enabled = 0
WHERE source_key IN (
  'yildizli_bulten',
  'puanli_altili_bulten',
  'yabanci_ganyan'
);

-- Editorial / professional analysis sources.
INSERT INTO source_registry
(
  source_key,
  source_name,
  domain,
  homepage_url,
  health_status,
  discovery_confidence,
  source_type,
  base_weight,
  enabled
)
VALUES
(
  'horseturk',
  'HorseTurk',
  'horseturk.com',
  'https://www.horseturk.com',
  'unknown',
  0.80,
  'editorial',
  1.00,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;

INSERT INTO source_registry
(
  source_key,source_name,domain,homepage_url,
  health_status,discovery_confidence,
  source_type,base_weight,enabled
)
VALUES
(
  'banko_tahminler',
  'Banko Tahminler',
  'bankotahminler.com',
  'https://www.bankotahminler.com',
  'unknown',
  0.80,
  'editorial',
  1.00,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;

INSERT INTO source_registry
(
  source_key,source_name,domain,homepage_url,
  health_status,discovery_confidence,
  source_type,base_weight,enabled
)
VALUES
(
  'liderform',
  'Liderform',
  'liderform.com.tr',
  'https://liderform.com.tr/experts',
  'unknown',
  0.90,
  'editorial',
  1.00,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;

INSERT INTO source_registry
(
  source_key,source_name,domain,homepage_url,
  health_status,discovery_confidence,
  source_type,base_weight,enabled
)
VALUES
(
  'yaris_dergisi',
  'Yarış Dergisi',
  'yarisdergisi.com',
  'https://www.yarisdergisi.com/tag/altili-tahmin/',
  'unknown',
  0.90,
  'editorial',
  1.00,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;

INSERT INTO source_registry
(
  source_key,source_name,domain,homepage_url,
  health_status,discovery_confidence,
  source_type,base_weight,enabled
)
VALUES
(
  'yaris_analizi',
  'Yarış Analizi',
  'yarisanalizi.com',
  'https://www.yarisanalizi.com/yazarlar/yazilari/9/Yaris-Analizi.html',
  'unknown',
  0.85,
  'editorial',
  1.00,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;

INSERT INTO source_registry
(
  source_key,source_name,domain,homepage_url,
  health_status,discovery_confidence,
  source_type,base_weight,enabled
)
VALUES
(
  'istinye_ganyan',
  'İstinye Ganyan',
  'istinyeganyan.com',
  'https://istinyeganyan.com/ganyan/tahminler/',
  'unknown',
  0.85,
  'editorial',
  1.00,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;

-- Community/crowd signal. Intentionally lower prior weight.
INSERT INTO source_registry
(
  source_key,source_name,domain,homepage_url,
  health_status,discovery_confidence,
  source_type,base_weight,enabled
)
VALUES
(
  'ganyan_canavari',
  'Ganyan Canavarı',
  'ganyancanavari.com.tr',
  'https://www.ganyancanavari.com.tr/',
  'unknown',
  0.80,
  'crowd',
  0.55,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;

-- Strategy/analytics source; separate from editorial experts.
INSERT INTO source_registry
(
  source_key,source_name,domain,homepage_url,
  health_status,discovery_confidence,
  source_type,base_weight,enabled
)
VALUES
(
  'afa',
  'AFA',
  'atlarafisildayanadam.com',
  'https://atlarafisildayanadam.com/',
  'unknown',
  0.75,
  'analytics',
  0.75,
  1
)
ON CONFLICT(source_key) DO UPDATE SET
  source_name=excluded.source_name,
  domain=excluded.domain,
  homepage_url=excluded.homepage_url,
  source_type=excluded.source_type,
  base_weight=excluded.base_weight,
  enabled=excluded.enabled;
