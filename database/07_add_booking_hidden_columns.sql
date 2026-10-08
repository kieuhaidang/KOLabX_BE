-- KOLab Database Migrations (v1.7)
-- Bổ sung các cột phục vụ tính năng ẩn/xóa tin nhắn/booking cho bảng bookings

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DELIMITER //

DROP PROCEDURE IF EXISTS AddBookingColumns //
CREATE PROCEDURE AddBookingColumns()
BEGIN
    DECLARE current_db VARCHAR(255);
    SET current_db = DATABASE();

    -- Thêm cột marketer_hidden
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = current_db AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'marketer_hidden'
    ) THEN
        ALTER TABLE bookings ADD COLUMN marketer_hidden TINYINT(1) NOT NULL DEFAULT 0;
    END IF;

    -- Thêm cột marketer_deleted_at
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = current_db AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'marketer_deleted_at'
    ) THEN
        ALTER TABLE bookings ADD COLUMN marketer_deleted_at DATETIME NULL;
    END IF;

    -- Thêm cột koc_hidden
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = current_db AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'koc_hidden'
    ) THEN
        ALTER TABLE bookings ADD COLUMN koc_hidden TINYINT(1) NOT NULL DEFAULT 0;
    END IF;

    -- Thêm cột koc_deleted_at
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = current_db AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'koc_deleted_at'
    ) THEN
        ALTER TABLE bookings ADD COLUMN koc_deleted_at DATETIME NULL;
    END IF;
END //

DELIMITER ;

CALL AddBookingColumns();
DROP PROCEDURE IF EXISTS AddBookingColumns;

SET FOREIGN_KEY_CHECKS = 1;
