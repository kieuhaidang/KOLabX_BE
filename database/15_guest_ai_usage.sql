CREATE TABLE IF NOT EXISTS guest_ai_usage (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  guest_key_hash CHAR(64) NOT NULL,
  feature ENUM('auto_brief', 'script_doctor') NOT NULL,
  usage_count INT UNSIGNED NOT NULL DEFAULT 0,
  pending_count INT UNSIGNED NOT NULL DEFAULT 0,
  pending_updated_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  last_used_at DATETIME NULL,
  last_request_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_guest_ai_usage_guest_feature (guest_key_hash, feature),
  KEY idx_guest_ai_usage_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
