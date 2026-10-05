-- Minimal stand-in for the races table so the coupon snapshot
-- migrations (which ALTER it) can run in the in-memory test DB.
CREATE TABLE races (id INTEGER PRIMARY KEY);
