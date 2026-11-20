ALTER TABLE generation_jobs
  MODIFY COLUMN mode ENUM('image','video','motion_batch','motion_render') NOT NULL DEFAULT 'image';
