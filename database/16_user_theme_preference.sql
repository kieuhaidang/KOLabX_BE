-- Theme giao diện người dùng chọn (id theme định nghĩa ở frontend/src/theme/themes.ts).
-- NULL = dùng theme mặc định.
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'theme_preference'
);
SET @sql := IF(@col_exists = 0,
  'ALTER TABLE users ADD COLUMN theme_preference VARCHAR(32) NULL DEFAULT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
