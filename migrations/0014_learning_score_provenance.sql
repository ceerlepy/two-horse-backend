-- Keep scoring provenance for out-of-sample evaluation.
--
-- model_score continues to mean FINAL adjusted score
-- for backward compatibility.

ALTER TABLE learning_runner_features
ADD COLUMN base_model_score REAL;

ALTER TABLE learning_runner_features
ADD COLUMN learning_adjustment REAL;
