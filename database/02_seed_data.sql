-- KOLab Comprehensive Demo Seed Data (v1.2)
-- FIXED: Corrected column order for users 20-23
-- Optimized for production testing / NO TRUNCATE to avoid permission issues

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Xóa dữ liệu cũ an toàn
SET SQL_SAFE_UPDATES = 0;
DELETE FROM messages;
DELETE FROM earnings;
DELETE FROM payments;
DELETE FROM withdrawals;
DELETE FROM bookings;
DELETE FROM script_reviews;
DELETE FROM ai_briefs;
DELETE FROM campaigns;
DELETE FROM koc_profiles;
DELETE FROM marketer_profiles;
DELETE FROM users;
SET SQL_SAFE_UPDATES = 1;

-- 1. SEED USERS (Password: password123)
-- Hash below is for 'password123'
SET @pass = '$2b$10$S9GjH8Mh.k6z7mQ9pDk6UeK8kQ7q1O6n1pG6rD7oH9iJ8kL7mN6O1';

INSERT INTO users (id, full_name, email, password_hash, role, status, is_verified) VALUES
(1, 'System Owner', 'owner@kolab.com', @pass, 'owner', 'active', TRUE),
(2, 'Admin 01', 'admin1@kolab.com', @pass, 'admin', 'active', TRUE),
(3, 'Admin 02', 'admin2@kolab.com', @pass, 'admin', 'active', TRUE),
-- Marketers (4-8)
(4, 'Nguyễn Thu Hà', 'ha.nguyen@loreal.vn', @pass, 'marketer', 'active', TRUE),
(5, 'Trần Minh Khoa', 'khoa.tran@samsung.com', @pass, 'marketer', 'active', TRUE),
(6, 'Lê Thị Mai', 'mai.le@coolmate.me', @pass, 'marketer', 'active', TRUE),
(7, 'Phạm Lan Anh', 'anh.pham@vinfast.vn', @pass, 'marketer', 'active', TRUE),
(8, 'Hoàng Nam', 'nam.hoang@shopee.vn', @pass, 'marketer', 'active', TRUE),
-- KOCs (9-23)
(9, 'Linh Trương', 'linh.truong@gmail.com', @pass, 'koc', 'active', TRUE),
(10, 'Kiên Review', 'kien.review@gmail.com', @pass, 'koc', 'active', TRUE),
(11, 'Hà Linh', 'ha.linh.official@gmail.com', @pass, 'koc', 'active', TRUE),
(12, 'Duy Thẩm', 'duy.tham@vj.com', @pass, 'koc', 'active', TRUE),
(13, 'Long Khoa Học', 'long.kh@gmail.com', @pass, 'koc', 'active', TRUE),
(14, 'Châu Bùi', 'chau.bui@fashion.com', @pass, 'koc', 'active', TRUE),
(15, 'Trinh Phạm', 'trinh.pham@beauty.vn', @pass, 'koc', 'active', TRUE),
(16, 'Khoai Lang Thang', 'khoai.lang.thang@travel.vn', @pass, 'koc', 'active', TRUE),
(17, 'Dinology', 'din.vu@food.com', @pass, 'koc', 'active', TRUE),
(18, 'Quang Vinh', 'quang.vinh@travel.com', @pass, 'koc', 'active', TRUE),
(19, 'Chloe Nguyễn', 'chloe.nguyen@beauty.com', @pass, 'koc', 'active', TRUE),
(20, 'Tân Một Cú', 'tan.mot.cu@schannel.vn', @pass, 'koc', 'active', TRUE),
(21, 'Cô Em Trendy', 'coem.trendy@fashion.vn', @pass, 'koc', 'active', TRUE),
(22, 'Fabibi Tech', 'fabibi@tech.vn', @pass, 'koc', 'active', TRUE),
(23, 'PewPew Streamer', 'pewpew@streaming.vn', @pass, 'koc', 'active', TRUE);

-- 2. SEED MARKETER PROFILES
INSERT INTO marketer_profiles (user_id, company_name, brand_name, industry, bio, website) VALUES
(4, 'L\'Oreal Vietnam', 'L\'Oreal Paris', 'Cosmetics', 'Tập đoàn mỹ phẩm hàng đầu thế giới.', 'https://loreal.vn'),
(5, 'Samsung Vina', 'Samsung Electronics', 'Technology', 'Định hình tương lai với những ý tưởng đột phá.', 'https://samsung.com/vn'),
(6, 'Coolmate JSC', 'Coolmate', 'Fashion', 'Thương hiệu thời trang nam tối giản cho người Việt.', 'https://coolmate.me'),
(7, 'VinFast Auto', 'VinFast', 'Automotive', 'Hãng xe điện thông minh của người Việt.', 'https://vinfastauto.com'),
(8, 'Shopee Vietnam', 'Shopee', 'E-commerce', 'Nền tảng thương mại điện tử hàng đầu Đông Nam Á.', 'https://shopee.vn');

-- 3. SEED KOC PROFILES
INSERT INTO koc_profiles (user_id, display_name, niche, platform, followers, engagement_rate, service_price, verified, bio, location, bank_name, bank_account_number, bank_account_name) VALUES
(9, 'Linh Trương Beauty', 'Beauty', 'TikTok, Instagram', 450000, 7.2, 5000000, TRUE, 'Beauty Blogger & Skincare Enthusiast', 'Hà Nội', 'Techcombank', '19034567890011', 'TRUONG DIEU LINH'),
(10, 'Kiên Review', 'Tech, Lifestyle', 'TikTok, YouTube', 1200000, 12.5, 15000000, TRUE, 'Review mọi thứ trên đời', 'TP.HCM', 'Vietcombank', '0071000123456', 'LUONG TRUNG KIEN'),
(11, 'Chiến Thần Hà Linh', 'Beauty, Food', 'TikTok, Facebook', 3500000, 15.0, 50000000, TRUE, 'Review chân thực, không nhận quảng cáo lố', 'Hà Nội', 'MB Bank', '0988888888', 'PHAM HA LINH'),
(12, 'Duy Thẩm Schannel', 'Technology', 'YouTube, TikTok', 2000000, 9.8, 25000000, TRUE, 'Review đồ công nghệ vui vẻ', 'Hà Nội', 'VPBank', '123456789', 'NGO DUC DUY'),
(13, 'Long Khoa Học', 'Tech, Education', 'TikTok', 850000, 6.5, 8000000, TRUE, 'Kiểm chứng mọi quảng cáo', 'TP.HCM', 'ACB', '99999999', 'TRUONG HOANG LONG'),
(14, 'Châu Bùi Official', 'Fashion', 'Instagram, TikTok', 4000000, 5.5, 70000000, TRUE, 'Fashionista & Influencer', 'TP.HCM', 'HSBC', '888777666', 'BUI THAI BAO CHAU'),
(15, 'Trinh Phạm', 'Beauty, Mom & Baby', 'YouTube', 1200000, 4.2, 12000000, TRUE, 'Chia sẻ bí quyết làm đẹp và chăm sóc gia đình', 'Hà Nội', 'TPBank', '0012345678', 'PHAM THI TRINH'),
(16, 'Khoai Lang Thang', 'Travel, Food', 'YouTube, Facebook', 2500000, 11.0, 30000000, TRUE, 'Du lịch và ẩm thực vùng miền', 'TP.HCM', 'VietinBank', '1010101010', 'DINH PHUONG THANH'),
(17, 'Dinology', 'Food, Cooking', 'YouTube, TikTok', 950000, 8.0, 10000000, TRUE, 'Yêu bếp và thích nấu ăn', 'TP.HCM', 'Vietcombank', '007100999999', 'VU DINH DUY'),
(18, 'Quang Vinh Travel', 'Travel, Luxury', 'YouTube, Instagram', 1100000, 3.5, 20000000, TRUE, 'Hoàng tử sơn ca & Travel Blogger', 'TP.HCM', 'Standard Chartered', '777666555', 'TRAN QUANG VINH'),
(19, 'Chloe Nguyen', 'Beauty, Lifestyle', 'Instagram', 600000, 5.0, 12000000, TRUE, 'Beauty Blogger & Luxury Lifestyle', 'TP.HCM', 'VIB', '666555444', 'NGUYEN CAO QUYNH ANH'),
(20, 'Tân Một Cú', 'Tech, Food', 'YouTube', 1500000, 8.5, 15000000, TRUE, 'Schannnel - Review đồ ăn và công nghệ', 'Hà Nội', 'Vietcombank', '0011223344', 'PHAM NGOC TAN'),
(21, 'Cô Em Trendy', 'Fashion, Lifestyle', 'TikTok, Instagram', 800000, 10.2, 20000000, TRUE, 'Fashionista & Creative Content Creator', 'TP.HCM', 'Techcombank', '19022334455', 'NGUYEN DANG KHANH LINH'),
(22, 'Fabibi Tech', 'Technology', 'TikTok', 300000, 14.0, 5000000, TRUE, 'Review đồ gia dụng thông minh', 'Đà Nẵng', 'MB Bank', '0505050505', 'LE HOANG PHUC'),
(23, 'PewPew', 'Gaming, Food', 'Facebook, YouTube', 5000000, 5.0, 40000000, TRUE, 'Streamer & Chủ tiệm bánh mì', 'TP.HCM', 'Vietcombank', '007122334455', 'HOANG VAN KHOA');

-- 4. SEED CAMPAIGNS
INSERT INTO campaigns (id, marketer_id, title, description, category, platform, budget, status, start_date, end_date) VALUES
(1, 4, 'Ra mắt dòng son L\'Oreal Paris Matte', 'Cần 5 KOC mảng Beauty review dòng son mới nhất. Yêu cầu có video TikTok 60s.', 'Beauty', 'TikTok', 25000000, 'open', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 30 DAY)),
(2, 5, 'Trải nghiệm Samsung Galaxy S26 Ultra', 'Đánh giá tính năng camera AI mới trên S26 Ultra. Ưu tiên KOC mảng công nghệ.', 'Technology', 'YouTube', 100000000, 'open', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 45 DAY)),
(3, 6, 'Coolmate - Mặc đẹp sống chất', 'Quảng bá dòng áo thun Ex-Dry cho nam giới năng động.', 'Fashion', 'Facebook', 15000000, 'open', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 20 DAY)),
(4, 7, 'VinFast VF3 - Xe điện cho mọi người', 'Video trải nghiệm lái thử xe VF3 tại đường phố Hà Nội/HCM.', 'Automotive', 'TikTok', 50000000, 'scheduled', DATE_ADD(CURDATE(), INTERVAL 7 DAY), DATE_ADD(CURDATE(), INTERVAL 37 DAY)),
(5, 8, 'Shopee 6.6 - Sale siêu rẻ', 'Giới thiệu các deal hot trong ngày 6.6.', 'E-commerce', 'TikTok', 30000000, 'open', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 10 DAY)),
(6, 4, 'Skincare Routine cùng L\'Oreal', 'Chia sẻ các bước chăm sóc da buổi tối với serum HA.', 'Beauty', 'Instagram', 10000000, 'paused', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 15 DAY));

-- 5. SEED BOOKINGS (Sample history)
INSERT INTO bookings (id, campaign_id, marketer_id, koc_id, direction, status, offered_price, note, created_at) VALUES
(1, 1, 4, 9, 'koc_applied', 'completed', 5000000, 'Em rất thích dòng son này, mong được hợp tác!', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(2, 1, 4, 11, 'marketer_invited', 'accepted', 45000000, 'Mời Hà Linh review độc quyền.', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(3, 2, 5, 12, 'koc_applied', 'accepted', 25000000, 'Schannel sẽ làm video bùng nổ cho S26 Ultra.', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(4, 5, 8, 10, 'koc_applied', 'pending', 12000000, 'Review deal Shopee cực hot.', NOW());

-- 6. SEED EARNINGS
INSERT INTO earnings (booking_id, koc_id, amount, status, paid_at, created_at) VALUES
(1, 9, 4500000, 'paid', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY));

SET FOREIGN_KEY_CHECKS = 1;
