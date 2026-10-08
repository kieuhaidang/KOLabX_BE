
-- KOLab Extra Demo Data (v1.6)
-- Dữ liệu bổ sung (Sửa lỗi tên cột koc_id trong bảng withdrawals)

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 0. Dọn dẹp dữ liệu cũ của script demo (để có thể chạy lại nhiều lần)
-- Lưu ý: Bảng withdrawals dùng tên cột là koc_id chứ không phải user_id
SET SQL_SAFE_UPDATES = 0;
DELETE FROM withdrawals WHERE koc_id IN (30, 31, 20, 23, 9) AND created_at >= CURDATE();
DELETE FROM earnings WHERE booking_id BETWEEN 20 AND 30;
DELETE FROM bookings WHERE id BETWEEN 20 AND 30;
DELETE FROM campaigns WHERE id BETWEEN 10 AND 15;
DELETE FROM marketer_profiles WHERE user_id IN (30, 31);
DELETE FROM users WHERE id IN (30, 31) OR email IN ('mai.dang@highlandscoffee.com.vn', 'anh.tran@grab.com');
SET SQL_SAFE_UPDATES = 1;

-- 1. Bổ sung thêm Marketer (Bắt đầu từ ID 30)
INSERT INTO users (id, full_name, email, password_hash, role, status, is_verified) VALUES
(30, 'Đặng Tuyết Mai', 'mai.dang@highlandscoffee.com.vn', '$2b$10$S9GjH8Mh.k6z7mQ9pDk6UeK8kQ7q1O6n1pG6rD7oH9iJ8kL7mN6O1', 'marketer', 'active', TRUE),
(31, 'Trần Thế Anh', 'anh.tran@grab.com', '$2b$10$S9GjH8Mh.k6z7mQ9pDk6UeK8kQ7q1O6n1pG6rD7oH9iJ8kL7mN6O1', 'marketer', 'active', TRUE);

INSERT INTO marketer_profiles (user_id, company_name, brand_name, industry, bio, website) VALUES
(30, 'Highlands Coffee', 'Highlands', 'Food & Beverage', 'Thương hiệu cà phê quốc dân của người Việt.', 'https://highlandscoffee.com.vn'),
(31, 'Grab Vietnam', 'GrabFood', 'Services', 'Siêu ứng dụng hàng đầu Đông Nam Á.', 'https://grab.com/vn');

-- 2. Bổ sung thêm Campaign (ID 10+)
INSERT INTO campaigns (id, marketer_id, title, description, category, platform, budget, status, start_date, end_date) VALUES
(10, 30, 'Highlands Phindi Hạnh Nhân', 'Quảng bá dòng Phindi mới. Cần KOC mảng Lifestyle/Food chụp ảnh tại cửa hàng.', 'Food', 'Instagram', 20000000, 'open', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 25 DAY)),
(11, 31, 'GrabFood - Món ngon chuẩn quán', 'Review các quán ăn local chất lượng trên GrabFood.', 'Food', 'TikTok', 40000000, 'open', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY)),
(12, 6, 'Coolmate Active Collection', 'Ra mắt bộ sưu tập đồ thể thao mới.', 'Fashion', 'YouTube', 35000000, 'open', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 40 DAY));

-- 3. Bổ sung thêm Bookings (ID 20+)
INSERT INTO bookings (id, campaign_id, marketer_id, koc_id, direction, status, offered_price, note, created_at) VALUES
-- Thêm các ứng tuyển đang chờ cho L'Oreal (Marketer ID 4)
(20, 1, 4, 15, 'koc_applied', 'pending', 10000000, 'Trinh Phạm rất muốn trải nghiệm dòng son này.', NOW()),
(21, 1, 4, 19, 'koc_applied', 'pending', 8000000, 'Chloe có thể chụp ảnh concept luxury cho son.', NOW()),
-- Thêm ứng tuyển cho Samsung (Marketer ID 5)
(22, 2, 5, 13, 'koc_applied', 'pending', 7000000, 'Long Khoa Học sẽ kiểm chứng camera AI.', NOW()),
-- Thêm ứng tuyển cho Highlands (Marketer ID 30)
(23, 10, 30, 17, 'koc_applied', 'accepted', 10000000, 'Dinology sẽ quay clip viral tại Highlands.', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(24, 10, 30, 21, 'marketer_invited', 'pending', 15000000, 'Highlands mời Cô Em Trendy hợp tác.', NOW()),
-- Thêm lịch sử hoàn thành cho Coolmate (Marketer ID 6)
(25, 3, 6, 20, 'koc_applied', 'completed', 12000000, 'Tân Một Cú review áo Ex-Dry.', DATE_SUB(NOW(), INTERVAL 15 DAY)),
(26, 3, 6, 23, 'marketer_invited', 'completed', 30000000, 'PewPew mặc áo Coolmate stream.', DATE_SUB(NOW(), INTERVAL 20 DAY));

-- 4. Bổ sung Earnings
INSERT INTO earnings (booking_id, koc_id, amount, status, paid_at, created_at) VALUES
(25, 20, 10800000, 'paid', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY)),
(26, 23, 27000000, 'paid', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY));

-- 5. Bổ sung Withdrawal
INSERT INTO withdrawals (koc_id, amount, bank_name, bank_account_number, bank_account_name, status, created_at) VALUES
(20, 5000000, 'Vietcombank', '0011223344', 'PHAM NGOC TAN', 'pending', NOW()),
(23, 20000000, 'Vietcombank', '007122334455', 'HOANG VAN KHOA', 'pending', NOW()),
(9, 2000000, 'Techcombank', '19034567890011', 'TRUONG DIEU LINH', 'completed', DATE_SUB(NOW(), INTERVAL 2 DAY));

SET FOREIGN_KEY_CHECKS = 1;
