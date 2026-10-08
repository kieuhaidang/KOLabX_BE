-- Add bank payment details to marketer profiles.
-- Apply after 10_campaign_payment_idempotency.sql.

DROP PROCEDURE IF EXISTS AddMarketerBankDetails;
DELIMITER //
CREATE PROCEDURE AddMarketerBankDetails()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'marketer_profiles'
          AND COLUMN_NAME = 'bank_name'
    ) THEN
        ALTER TABLE marketer_profiles
            ADD COLUMN bank_name VARCHAR(100) DEFAULT NULL,
            ADD COLUMN bank_account_number VARCHAR(50) DEFAULT NULL,
            ADD COLUMN bank_account_name VARCHAR(100) DEFAULT NULL;
    END IF;
END //
DELIMITER ;

CALL AddMarketerBankDetails();
DROP PROCEDURE AddMarketerBankDetails;
