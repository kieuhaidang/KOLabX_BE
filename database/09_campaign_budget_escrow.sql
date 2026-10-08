-- Migrations for Campaign Budget upfront Escrow & Marketer Wallets
SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1. Alter campaigns table to add status 'pending_payment' and remaining_budget safely
DROP PROCEDURE IF EXISTS AlterCampaignsSchema;
DELIMITER //
CREATE PROCEDURE AlterCampaignsSchema()
BEGIN
    ALTER TABLE campaigns MODIFY COLUMN status ENUM('draft', 'scheduled', 'open', 'paused', 'in_progress', 'completed', 'cancelled', 'pending_payment') DEFAULT 'draft';
    
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'campaigns' AND COLUMN_NAME = 'remaining_budget') THEN
        ALTER TABLE campaigns ADD COLUMN remaining_budget DECIMAL(12,2) DEFAULT 0.00 AFTER budget;
    END IF;
END //
DELIMITER ;
CALL AlterCampaignsSchema();
DROP PROCEDURE AlterCampaignsSchema;

-- 2. Alter payments table to support 'campaign' payment type and foreign key campaign_id
DROP PROCEDURE IF EXISTS AlterPaymentsPaymentType;
DELIMITER //
CREATE PROCEDURE AlterPaymentsPaymentType()
BEGIN
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_type') THEN
        ALTER TABLE payments ADD COLUMN payment_type ENUM('booking', 'subscription', 'campaign') DEFAULT 'booking' AFTER amount;
    ELSE
        ALTER TABLE payments MODIFY COLUMN payment_type ENUM('booking', 'subscription', 'campaign') DEFAULT 'booking';
    END IF;
END //
DELIMITER ;
CALL AlterPaymentsPaymentType();
DROP PROCEDURE AlterPaymentsPaymentType;

-- Add campaign_id column if not exists
DROP PROCEDURE IF EXISTS AddCampaignIdToPayments;
DELIMITER //
CREATE PROCEDURE AddCampaignIdToPayments()
BEGIN
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'payments' AND COLUMN_NAME = 'campaign_id') THEN
        ALTER TABLE payments ADD COLUMN campaign_id INT DEFAULT NULL AFTER booking_id;
        ALTER TABLE payments ADD CONSTRAINT fk_payments_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
    END IF;
END //
DELIMITER ;
CALL AddCampaignIdToPayments();
DROP PROCEDURE AddCampaignIdToPayments;

-- 3. Create wallets table
CREATE TABLE IF NOT EXISTS wallets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    balance DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Create wallet_transactions table
CREATE TABLE IF NOT EXISTS wallet_transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    wallet_id INT NOT NULL,
    amount DECIMAL(15, 2) NOT NULL,
    type ENUM('refund', 'withdrawal', 'payment') NOT NULL,
    reference_id INT DEFAULT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Modify bookings status ENUM to support all project phases and status changes
ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'draft_submitted', 'revision_requested', 'final_submitted', 'ready_to_connect', 'payment_rejected', 'in_progress') NOT NULL DEFAULT 'pending';

-- 6. Modify withdrawals status ENUM if needed, but it already supports pending, approved, rejected, completed
-- and let's make sure withdrawals table can store user_id instead of just KOC.
-- Currently withdrawals has koc_id pointing to users(id). We can use it as-is or add a comment that it works for both marketer and koc.

SET FOREIGN_KEY_CHECKS = 1;
