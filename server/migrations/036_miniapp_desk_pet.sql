ALTER TABLE desktop_profiles
  ADD COLUMN miniapp_pet_id VARCHAR(64) NOT NULL DEFAULT 'system-tabby-cat',
  ADD COLUMN miniapp_enabled BOOLEAN NOT NULL DEFAULT TRUE;
