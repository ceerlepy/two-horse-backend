ALTER TABLE learning_runner_features
ADD COLUMN shadow_model_score REAL;

-- Historical safety:
-- insufficient-data must never actively modify production score.
UPDATE learning_model_state
SET learning_scale = 0
WHERE status = 'insufficient-data';
