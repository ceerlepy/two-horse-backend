-- Subscription state the app shows on the membership screen:
-- whether Google will renew it (off after the member cancels in
-- Google Play) and the plan a deferred Premium -> Gold switch will
-- move to at the next renewal. Both are refreshed from Google's
-- subscriptionsv2 response on every verify/recheck.
ALTER TABLE users ADD COLUMN subscription_auto_renew INTEGER;
ALTER TABLE users ADD COLUMN subscription_pending_product_id TEXT;
