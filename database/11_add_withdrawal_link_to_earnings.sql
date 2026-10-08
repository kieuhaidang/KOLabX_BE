-- Migration to link individual earnings to withdrawals
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP PROCEDURE IF EXISTS AddWithdrawalIdToEarnings;
DELIMITER //
CREATE PROCEDURE AddWithdrawalIdToEarnings()
BEGIN
    -- 1. Check if column exists, if not add it
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'earnings' 
          AND COLUMN_NAME = 'withdrawal_id'
    ) THEN
        ALTER TABLE earnings ADD COLUMN withdrawal_id INT DEFAULT NULL AFTER koc_id;
    END IF;

    -- 2. Add Foreign Key constraint safely
    IF NOT EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
        WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'earnings' 
          AND CONSTRAINT_NAME = 'fk_earnings_withdrawal'
    ) THEN
        ALTER TABLE earnings ADD CONSTRAINT fk_earnings_withdrawal FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id) ON DELETE SET NULL;
    END IF;
END //
DELIMITER ;

CALL AddWithdrawalIdToEarnings();
DROP PROCEDURE AddWithdrawalIdToEarnings;

SET FOREIGN_KEY_CHECKS = 1;
