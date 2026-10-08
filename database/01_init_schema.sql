-- KOLab Production Schema (Consolidated v1.1)
-- Optimized for phpMyAdmin / Shared Hosting
-- Grouped DROP TABLE commands at the top for clean re-initialization

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =====================================
-- 0. CLEANUP (DROP ALL TABLES)
-- =====================================
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS platform_settings;
DROP TABLE IF EXISTS shortlists;
DROP TABLE IF EXISTS withdrawals;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS earnings;
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS script_reviews;
DROP TABLE IF EXISTS ai_briefs;
DROP TABLE IF EXISTS bookings;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS koc_profiles;
DROP TABLE IF EXISTS marketer_profiles;
DROP TABLE IF EXISTS users;

SET FOREIGN_KEY_CHECKS = 1;

-- =====================================
-- 1. USERS
-- =====================================
CREATE TABLE users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'marketer', 'koc', 'owner') NOT NULL,
    status ENUM('active', 'inactive', 'banned') DEFAULT 'active',
    is_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255),
    reset_password_token VARCHAR(255),
    reset_password_expires DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. MARKETER PROFILES
CREATE TABLE marketer_profiles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    company_name VARCHAR(150),
    brand_name VARCHAR(150),
    industry VARCHAR(100),
    bio TEXT,
    website VARCHAR(255),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_marketer_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. KOC PROFILES
CREATE TABLE koc_profiles (
    id INT PRIMARY KEY AUTO_INCREMENT,
    user_id INT NOT NULL UNIQUE,
    display_name VARCHAR(100),
    niche VARCHAR(100),
    platform VARCHAR(50),
    followers INT DEFAULT 0,
    engagement_rate DECIMAL(5,2) DEFAULT 0.00,
    service_price DECIMAL(12,2) DEFAULT 0.00,
    verified BOOLEAN DEFAULT FALSE,
    bio TEXT,
    location VARCHAR(100),
    avatar_url TEXT,
    bank_name VARCHAR(100) DEFAULT NULL,
    bank_account_number VARCHAR(50) DEFAULT NULL,
    bank_account_name VARCHAR(100) DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_koc_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. CAMPAIGNS
CREATE TABLE campaigns (
    id INT PRIMARY KEY AUTO_INCREMENT,
    marketer_id INT NOT NULL,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    platform VARCHAR(50),
    target_followers_min INT DEFAULT 0,
    target_followers_max INT DEFAULT 0,
    target_engagement_min DECIMAL(5,2) DEFAULT 0.00,
    budget DECIMAL(12,2) DEFAULT 0.00,
    status ENUM('draft', 'scheduled', 'open', 'paused', 'in_progress', 'completed', 'cancelled') DEFAULT 'draft',
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_campaigns_marketer FOREIGN KEY (marketer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. BOOKINGS / APPLICATIONS
CREATE TABLE bookings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    campaign_id INT NOT NULL,
    marketer_id INT NOT NULL,
    koc_id INT NOT NULL,
    direction ENUM('marketer_invited', 'koc_applied') NOT NULL,
    status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'completed') DEFAULT 'pending',
    offered_price DECIMAL(12,2) DEFAULT 0.00,
    note TEXT,
    sample_link TEXT,
    estimated_delivery_days INT DEFAULT 3,
    draft_link TEXT,
    final_link TEXT,
    is_visible_to_koc BOOLEAN DEFAULT TRUE,
    is_visible_to_marketer BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_bookings_campaign FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    CONSTRAINT fk_bookings_marketer FOREIGN KEY (marketer_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_bookings_koc FOREIGN KEY (koc_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. MESSAGES
CREATE TABLE messages (
    id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL,
    sender_id INT NOT NULL,
    content TEXT NOT NULL,
    file_url TEXT,
    file_type VARCHAR(100),
    is_visible_to_koc BOOLEAN DEFAULT TRUE,
    is_visible_to_marketer BOOLEAN DEFAULT TRUE,
    sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_messages_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. EARNINGS
CREATE TABLE earnings (
    id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL,
    koc_id INT NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    status ENUM('pending', 'paid', 'cancelled') DEFAULT 'pending',
    paid_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_earnings_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_earnings_koc FOREIGN KEY (koc_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 8. DISPUTES
CREATE TABLE disputes (
    id INT PRIMARY KEY AUTO_INCREMENT,
    booking_id INT NOT NULL,
    raised_by_id INT NOT NULL,
    reason TEXT NOT NULL,
    evidence_url TEXT,
    status ENUM('pending', 'investigating', 'resolved', 'dismissed') DEFAULT 'pending',
    resolution_note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_disputes_booking FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    CONSTRAINT fk_disputes_user FOREIGN KEY (raised_by_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 9. PAYMENTS (PayOS Transactions)
CREATE TABLE payments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    booking_id INT DEFAULT NULL,
    order_code BIGINT NOT NULL UNIQUE,
    amount DECIMAL(15, 2) NOT NULL,
    status ENUM('pending', 'paid', 'cancelled', 'expired') DEFAULT 'pending',
    description TEXT,
    payos_order_id VARCHAR(255) DEFAULT NULL,
    checkout_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 10. WITHDRAWALS
CREATE TABLE withdrawals (
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
    FOREIGN KEY (koc_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 11. SHORTLISTS
CREATE TABLE shortlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marketer_id INT NOT NULL,
  koc_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (marketer_id, koc_id),
  FOREIGN KEY (marketer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (koc_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 12. PLATFORM SETTINGS
CREATE TABLE platform_settings (
  setting_key VARCHAR(50) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO platform_settings (setting_key, setting_value) VALUES 
('platform_fee_percent', '10.0'),
('min_withdrawal_amount', '50000');

-- 13. AUDIT LOGS
CREATE TABLE audit_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  action VARCHAR(255) NOT NULL,
  entity_type VARCHAR(50),
  entity_id INT,
  old_value JSON,
  new_value JSON,
  ip_address VARCHAR(45),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 14. AI BRIEFS & SCRIPT REVIEWS
CREATE TABLE ai_briefs (
    id INT PRIMARY KEY AUTO_INCREMENT,
    marketer_id INT NOT NULL,
    product_name VARCHAR(200),
    input_text TEXT,
    generated_brief TEXT,
    category VARCHAR(100),
    platform VARCHAR(50),
    suggested_kpi VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ai_briefs_marketer FOREIGN KEY (marketer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE script_reviews (
    id INT PRIMARY KEY AUTO_INCREMENT,
    koc_id INT NOT NULL,
    script_text TEXT NOT NULL,
    viral_score INT,
    engagement_score INT,
    policy_warning TEXT,
    rewrite_suggestion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_script_reviews_koc FOREIGN KEY (koc_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
