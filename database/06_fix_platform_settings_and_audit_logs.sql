-- KOLab Database Migrations (v1.6)
-- Sửa lỗi cấu trúc bảng platform_settings và audit_logs khớp với mã nguồn backend

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Tái thiết lập bảng platform_settings để khớp với owner.service.js
DROP TABLE IF EXISTS platform_settings;
CREATE TABLE platform_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  platform_fee_percent DECIMAL(5, 2) NOT NULL DEFAULT 10.00,
  koc_payout_percent DECIMAL(5, 2) NOT NULL DEFAULT 90.00,
  payout_delay_days INT NOT NULL DEFAULT 3,
  auto_release_enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_platform_settings_updated_by
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Thêm cấu hình mặc định
INSERT INTO platform_settings (platform_fee_percent, koc_payout_percent, payout_delay_days, auto_release_enabled)
VALUES (10.00, 90.00, 3, 1);

-- 2. Tái thiết lập bảng audit_logs để khớp với audit.service.js và owner.service.js
DROP TABLE IF EXISTS audit_logs;
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NULL,
  actor_role VARCHAR(50) NOT NULL,
  action VARCHAR(255) NOT NULL,
  target_type VARCHAR(100) NOT NULL,
  target_id INT NULL,
  description TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_logs_actor
    FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;
