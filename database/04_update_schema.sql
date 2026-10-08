-- KOLab Database Migrations Consolidated (v1.5 - MySQL 5.7+ Compatible)
-- Gộp tất cả các bản cập nhật từ backend/migrations/ vào file 04 này.
-- Sử dụng PROCEDURE để kiểm tra và thêm cột an toàn, tương thích với MySQL cũ.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DELIMITER //

-- =====================================
-- HÀM HỖ TRỢ: Thêm cột an toàn (Không lỗi nếu đã tồn tại)
-- =====================================
DROP PROCEDURE IF EXISTS AddColumnIfNotExists //
CREATE PROCEDURE AddColumnIfNotExists(
    IN dbName VARCHAR(255),
    IN tableName VARCHAR(255),
    IN columnName VARCHAR(255),
    IN columnDefinition TEXT
)
BEGIN
    DECLARE column_count INT;
    
    SELECT COUNT(*) INTO column_count
    FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_SCHEMA = dbName
      AND TABLE_NAME = tableName
      AND COLUMN_NAME = columnName;
      
    IF column_count = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD COLUMN ', columnName, ' ', columnDefinition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

-- =====================================
-- HÀM HỖ TRỢ: Đổi kiểu dữ liệu an toàn
-- =====================================
DROP PROCEDURE IF EXISTS ModifyColumn //
CREATE PROCEDURE ModifyColumn(
    IN tableName VARCHAR(255),
    IN columnName VARCHAR(255),
    IN columnDefinition TEXT
)
BEGIN
    SET @ddl = CONCAT('ALTER TABLE ', tableName, ' MODIFY COLUMN ', columnName, ' ', columnDefinition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
END //

DELIMITER ;

-- =====================================
-- THỰC THI CÁC CẬP NHẬT
-- =====================================
-- Lưu ý: Lấy tên database hiện tại
SET @current_db = DATABASE();

-- 1. Cập nhật bảng KOC PROFILES
CALL AddColumnIfNotExists(@current_db, 'koc_profiles', 'plan', "ENUM('free','plus') NOT NULL DEFAULT 'free' AFTER location");
CALL AddColumnIfNotExists(@current_db, 'koc_profiles', 'ai_monthly_limit', "INT NOT NULL DEFAULT 5 AFTER plan");
CALL AddColumnIfNotExists(@current_db, 'koc_profiles', 'ai_used_this_month', "INT NOT NULL DEFAULT 0 AFTER ai_monthly_limit");
CALL AddColumnIfNotExists(@current_db, 'koc_profiles', 'ai_usage_reset_at', "DATETIME NULL AFTER ai_used_this_month");
CALL AddColumnIfNotExists(@current_db, 'koc_profiles', 'is_search_boosted', "TINYINT(1) NOT NULL DEFAULT 0 AFTER ai_usage_reset_at");

-- 2. Cập nhật bảng BOOKINGS
CALL AddColumnIfNotExists(@current_db, 'bookings', 'draft_link', "VARCHAR(500) NULL AFTER sample_link");
CALL AddColumnIfNotExists(@current_db, 'bookings', 'final_link', "VARCHAR(500) NULL AFTER draft_link");
CALL AddColumnIfNotExists(@current_db, 'bookings', 'submitted_at', "DATETIME NULL AFTER final_link");
CALL AddColumnIfNotExists(@current_db, 'bookings', 'reviewed_at', "DATETIME NULL AFTER submitted_at");
CALL AddColumnIfNotExists(@current_db, 'bookings', 'review_note', "TEXT NULL AFTER reviewed_at");

CALL ModifyColumn('bookings', 'status', "ENUM('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'draft_submitted', 'revision_requested', 'final_submitted', 'in_progress') NOT NULL DEFAULT 'pending'");

-- 3. Cập nhật bảng CAMPAIGNS
CALL AddColumnIfNotExists(@current_db, 'campaigns', 'start_date', "DATETIME NULL AFTER status");
CALL AddColumnIfNotExists(@current_db, 'campaigns', 'end_date', "DATETIME NULL AFTER start_date");

-- Đồng bộ dữ liệu ngày nếu đang trống (Tắt Safe Updates tạm thời)
SET SQL_SAFE_UPDATES = 0;
UPDATE campaigns
SET start_date = COALESCE(start_date, created_at, CURRENT_TIMESTAMP),
    end_date = COALESCE(end_date, DATE_ADD(COALESCE(created_at, CURRENT_TIMESTAMP), INTERVAL 7 DAY))
WHERE start_date IS NULL OR end_date IS NULL;
SET SQL_SAFE_UPDATES = 1;

CALL ModifyColumn('campaigns', 'start_date', "DATETIME NOT NULL");
CALL ModifyColumn('campaigns', 'end_date', "DATETIME NOT NULL");
CALL ModifyColumn('campaigns', 'status', "ENUM('draft', 'scheduled', 'open', 'paused', 'in_progress', 'completed', 'cancelled') DEFAULT 'draft'");

-- 4. Bảng WITHDRAWALS (Tạo mới nếu chưa có)
CREATE TABLE IF NOT EXISTS withdrawals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  koc_id INT NOT NULL,
  amount DECIMAL(15, 2) NOT NULL,
  bank_name VARCHAR(100) NOT NULL,
  bank_account_number VARCHAR(50) NOT NULL,
  bank_account_name VARCHAR(100) NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'completed') DEFAULT 'pending',
  admin_note TEXT,
  processed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_withdrawals_koc_updated
    FOREIGN KEY (koc_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- =====================================
-- DỌN DẸP
-- =====================================
DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS ModifyColumn;
SET FOREIGN_KEY_CHECKS = 1;
