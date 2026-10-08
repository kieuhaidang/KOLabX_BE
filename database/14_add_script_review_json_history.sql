SET NAMES utf8mb4;

DELIMITER //

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

DROP PROCEDURE IF EXISTS AddIndexIfNotExists //
CREATE PROCEDURE AddIndexIfNotExists(
    IN dbName VARCHAR(255),
    IN tableName VARCHAR(255),
    IN indexName VARCHAR(255),
    IN indexDefinition TEXT
)
BEGIN
    DECLARE index_count INT;

    SELECT COUNT(*) INTO index_count
    FROM INFORMATION_SCHEMA.STATISTICS
    WHERE TABLE_SCHEMA = dbName
      AND TABLE_NAME = tableName
      AND INDEX_NAME = indexName;

    IF index_count = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD INDEX ', indexName, ' ', indexDefinition);
        PREPARE stmt FROM @ddl;
        EXECUTE stmt;
        DEALLOCATE PREPARE stmt;
    END IF;
END //

DELIMITER ;

SET @current_db = DATABASE();

CALL AddColumnIfNotExists(@current_db, 'script_reviews', 'input_script', 'TEXT NULL AFTER script_text');
CALL AddColumnIfNotExists(@current_db, 'script_reviews', 'optional_fields', 'JSON NULL AFTER input_script');
CALL AddColumnIfNotExists(@current_db, 'script_reviews', 'result', 'JSON NULL AFTER optional_fields');
CALL AddColumnIfNotExists(@current_db, 'script_reviews', 'updated_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at');

SET SQL_SAFE_UPDATES = 0;
UPDATE script_reviews
SET input_script = script_text
WHERE input_script IS NULL AND script_text IS NOT NULL;
SET SQL_SAFE_UPDATES = 1;

CALL AddIndexIfNotExists(@current_db, 'script_reviews', 'idx_script_reviews_koc_updated', '(koc_id, updated_at)');

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
