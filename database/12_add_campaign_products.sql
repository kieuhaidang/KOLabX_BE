-- Add sponsor product details to campaigns table.
-- Apply after 11_marketer_bank_details.sql.

DROP PROCEDURE IF EXISTS AddCampaignSponsorProducts;
DELIMITER //
CREATE PROCEDURE AddCampaignSponsorProducts()
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'campaigns'
          AND COLUMN_NAME = 'product_name'
    ) THEN
        ALTER TABLE campaigns
            ADD COLUMN product_name VARCHAR(255) DEFAULT NULL AFTER target_engagement_min,
            ADD COLUMN product_description TEXT DEFAULT NULL AFTER product_name,
            ADD COLUMN product_images JSON DEFAULT NULL AFTER product_description;
    END IF;
END //
DELIMITER ;

CALL AddCampaignSponsorProducts();
DROP PROCEDURE AddCampaignSponsorProducts;
