-- 1. Tạo bảng Danh mục các gói dịch vụ
CREATE TABLE IF NOT EXISTS subscription_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    price DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
    duration_days INT NOT NULL DEFAULT 30, -- Số ngày của gói
    features JSON, -- Lưu mảng các quyền lợi dạng JSON
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Thêm dữ liệu mẫu cho các gói (Sử dụng INSERT IGNORE để tránh lỗi nếu chạy lại)
INSERT INTO subscription_plans (id, name, description, price, duration_days, features) VALUES
(1, 'Free', 'Phù hợp để bắt đầu', 0, 3650, 
 '["Tối đa 1 chiến dịch / tháng", "Tìm kiếm KOL cơ bản", "Xem 10 KOL / tháng", "Báo cáo hiệu suất cơ bản"]'),

(2, 'Starter', 'Mở rộng chiến dịch nhanh', 299000, 30, 
 '["20 chiến dịch / tháng", "AI Brief Generator", "Advanced KOL Filter", "Lọc theo ngành/follower/platform", "Xem 50 KOL / ngày", "Shortlist KOL theo brief", "Export danh sách KOL"]'),

(3, 'Growth', 'Gói khuyến nghị', 599000, 30, 
 '["Chiến dịch không giới hạn", "AI Brief Auto Generate", "AI KOL Matching (Smart Listing)", "Advanced analytics", "KOL performance prediction", "Campaign tracking", "Chat với KOL trong platform", "Export report"]'),

(4, 'Business / Enterprise', 'Dành cho team và doanh nghiệp', 1499000, 30, 
 '["Tất cả tính năng Growth", "Multi-user team", "Campaign automation", "KOL CRM", "API Integration", "White-label report", "Dedicated Account Manager"]');

-- 2. Tạo bảng Quản lý gói người dùng đang sử dụng
CREATE TABLE IF NOT EXISTS subscriptions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    marketer_id INT NOT NULL,
    plan_id INT NOT NULL,
    start_date DATETIME NOT NULL,
    end_date DATETIME NOT NULL,
    status ENUM('active', 'expired', 'cancelled') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (marketer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES subscription_plans(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Cập nhật bảng payments hiện tại để hỗ trợ thanh toán gói
-- Sử dụng khối thủ tục để thêm cột an toàn nếu chưa tồn tại
DROP PROCEDURE IF EXISTS AddSubscriptionColumns;
DELIMITER //
CREATE PROCEDURE AddSubscriptionColumns()
BEGIN
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'payment_type') THEN
        ALTER TABLE payments ADD COLUMN payment_type ENUM('booking', 'subscription') DEFAULT 'booking' AFTER amount;
    END IF;
    
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'subscription_plan_id') THEN
        ALTER TABLE payments ADD COLUMN subscription_plan_id INT DEFAULT NULL AFTER payment_type;
        ALTER TABLE payments ADD CONSTRAINT fk_payments_subscription_plan FOREIGN KEY (subscription_plan_id) REFERENCES subscription_plans(id) ON DELETE SET NULL;
    END IF;
END //
DELIMITER ;
CALL AddSubscriptionColumns();
DROP PROCEDURE AddSubscriptionColumns;
