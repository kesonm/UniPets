CREATE TABLE IF NOT EXISTS h5_events (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  organizer VARCHAR(120) NOT NULL,
  city VARCHAR(60) NOT NULL,
  venue VARCHAR(160) NOT NULL,
  area VARCHAR(40) NULL,
  species ENUM('cat','dog','other') NULL,
  starts_at DATETIME(3) NOT NULL,
  registration_opens_at DATETIME(3) NOT NULL,
  registration_closes_at DATETIME(3) NOT NULL,
  rules TEXT NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (registration_opens_at < registration_closes_at AND registration_closes_at <= starts_at),
  INDEX (published, starts_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_event_registrations (
  event_id CHAR(36) NOT NULL,
  pet_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  submitted_at DATETIME(3) NOT NULL,
  PRIMARY KEY (event_id, pet_id),
  FOREIGN KEY (event_id) REFERENCES h5_events(id),
  FOREIGN KEY (pet_id) REFERENCES pets(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX (user_id, event_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS h5_training_courses (
  id CHAR(36) PRIMARY KEY,
  title VARCHAR(120) NOT NULL,
  learning_format VARCHAR(80) NOT NULL,
  starts_at DATETIME(3) NULL,
  exam_at DATETIME(3) NULL,
  exam_location VARCHAR(160) NOT NULL,
  eligibility VARCHAR(1500) NOT NULL,
  credential VARCHAR(120) NOT NULL,
  issuer VARCHAR(120) NOT NULL,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  INDEX (published, starts_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
