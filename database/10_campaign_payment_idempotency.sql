-- Campaign checkout idempotency. Apply after 09_campaign_budget_escrow.sql.

DROP PROCEDURE IF EXISTS AddCampaignPaymentIdempotency;
DELIMITER //
CREATE PROCEDURE AddCampaignPaymentIdempotency()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'payments'
          AND COLUMN_NAME = 'idempotency_key'
    ) THEN
        ALTER TABLE payments
            ADD COLUMN idempotency_key VARCHAR(64) DEFAULT NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'payments'
          AND INDEX_NAME = 'uq_payments_idempotency_key'
    ) THEN
        ALTER TABLE payments
            ADD UNIQUE KEY uq_payments_idempotency_key (idempotency_key);
    END IF;
END //
DELIMITER ;

CALL AddCampaignPaymentIdempotency();
DROP PROCEDURE AddCampaignPaymentIdempotency;
