INSERT INTO users (
  id,
  email,
  display_name,
  password_hash,
  tier,
  tier_source,
  created_at,
  updated_at
) VALUES (
  'seed-admin-veyseltosun',
  'veyseltosun.vt@gmail.com',
  'Veysel Tosun',
  'scrypt:16384:8:1:32f4c7214d6478b4fbd93b0fa9e6b78b:cd3f3e0eff2e3803fe2f98b3d52cdc891395ad96ffdec17e106fef36ad948a516e55ac3ca6b7af8738b458e2cb9de197d453c5134455ab983299e5ba80a34f87',
  'premium',
  'manual',
  strftime('%Y-%m-%dT%H:%M:%fZ','now'),
  strftime('%Y-%m-%dT%H:%M:%fZ','now')
)
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  tier = 'premium',
  tier_source = 'manual',
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now');
