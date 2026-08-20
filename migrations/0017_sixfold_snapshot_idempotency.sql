ALTER TABLE sixfold_coupon_snapshots
ADD COLUMN snapshot_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS
idx_sixfold_coupon_snapshot_key
ON sixfold_coupon_snapshots(
  snapshot_key
)
WHERE snapshot_key IS NOT NULL;
