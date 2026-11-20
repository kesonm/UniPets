ALTER TABLE generation_jobs ADD COLUMN appearance_reference_ids JSON NULL;
ALTER TABLE generation_actions ADD COLUMN provider_progress TINYINT UNSIGNED NULL;
