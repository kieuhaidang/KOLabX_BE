CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  booking_id INT DEFAULT NULL,
  order_code BIGINT NOT NULL UNIQUE,
  amount DECIMAL(15, 2) NOT NULL,
  status ENUM('pending', 'paid', 'confirmed', 'rejected', 'cancelled', 'expired') DEFAULT 'pending',
  description TEXT,
  payos_order_id VARCHAR(255) DEFAULT NULL,
  checkout_url TEXT,
  payment_method VARCHAR(50) DEFAULT 'payos',
  payment_proof_url VARCHAR(500) DEFAULT NULL,
  submitted_at DATETIME NULL,
  reviewed_by_admin_id INT NULL,
  reviewed_at DATETIME NULL,
  rejection_reason TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_booking
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  CONSTRAINT fk_payments_reviewed_by_admin
    FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

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

DROP PROCEDURE IF EXISTS AddConstraintIfNotExists //
CREATE PROCEDURE AddConstraintIfNotExists(
    IN dbName VARCHAR(255),
    IN tableName VARCHAR(255),
    IN constraintName VARCHAR(255),
    IN constraintDefinition TEXT
)
BEGIN
    DECLARE constraint_count INT;
    
    SELECT COUNT(*) INTO constraint_count
    FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = dbName
      AND TABLE_NAME = tableName
      AND CONSTRAINT_NAME = constraintName;
      
    IF constraint_count = 0 THEN
        SET @ddl = CONCAT('ALTER TABLE ', tableName, ' ADD CONSTRAINT ', constraintName, ' ', constraintDefinition);
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

ALTER TABLE payments
  MODIFY COLUMN status ENUM('pending', 'paid', 'confirmed', 'rejected', 'cancelled', 'expired') DEFAULT 'pending';

CALL AddColumnIfNotExists(@current_db, 'payments', 'payment_method', "VARCHAR(50) DEFAULT 'payos'");
CALL AddColumnIfNotExists(@current_db, 'payments', 'payment_proof_url', "VARCHAR(500) DEFAULT NULL");
CALL AddColumnIfNotExists(@current_db, 'payments', 'submitted_at', "DATETIME NULL");
CALL AddColumnIfNotExists(@current_db, 'payments', 'reviewed_by_admin_id', "INT NULL");
CALL AddColumnIfNotExists(@current_db, 'payments', 'reviewed_at', "DATETIME NULL");
CALL AddColumnIfNotExists(@current_db, 'payments', 'rejection_reason', "TEXT NULL");

CALL AddConstraintIfNotExists(@current_db, 'payments', 'fk_payments_reviewed_by_admin', "FOREIGN KEY (reviewed_by_admin_id) REFERENCES users(id) ON DELETE SET NULL");

ALTER TABLE bookings
  MODIFY COLUMN status ENUM(
    'pending',
    'accepted',
    'rejected',
    'cancelled',
    'completed',
    'draft_submitted',
    'revision_requested',
    'final_submitted',
    'ready_to_connect',
    'payment_rejected'
  ) NOT NULL DEFAULT 'pending';

CALL AddIndexIfNotExists(@current_db, 'payments', 'idx_payments_status', "(status)");
CALL AddIndexIfNotExists(@current_db, 'payments', 'idx_payments_booking_id', "(booking_id)");
CALL AddIndexIfNotExists(@current_db, 'payments', 'idx_payments_order_code', "(order_code)");
CALL AddIndexIfNotExists(@current_db, 'payments', 'idx_payments_reviewed_by_admin_id', "(reviewed_by_admin_id)");

DROP PROCEDURE IF EXISTS AddColumnIfNotExists;
DROP PROCEDURE IF EXISTS AddConstraintIfNotExists;
DROP PROCEDURE IF EXISTS AddIndexIfNotExists;
