const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { pool } = require('../config/db');

// Đường dẫn file CSV
const CSV_PATH = 'D:\\Summer 2026\\EXE 201\\New folder\\Database - Booking.csv';

// Hàm phân tích cú pháp CSV nâng cao (hỗ trợ xuống dòng trong dấu nháy kép)
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++; // Bỏ qua dấu nháy kép tiếp theo
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // Bỏ qua LF nếu là CRLF
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }
  
  if (currentRow.length > 0 || currentField !== '') {
    currentRow.push(currentField);
    rows.push(currentRow);
  }
  
  return rows;
}

// Phân tích giá cast/video
function parsePrice(castText) {
  if (!castText) return 0;
  const cleanText = castText.trim().toLowerCase();
  
  if (
    cleanText.includes('free') || 
    cleanText.includes('không cast') || 
    cleanText.includes('ko cast') ||
    (cleanText.includes('hh') && !cleanText.match(/\d/))
  ) {
    return 0;
  }
  
  // Xử lý định dạng dạng 1tr5 hoặc 1 triệu 5
  const trMatch = cleanText.match(/(\d+)\s*(tr|triệu)\s*(\d+)?/);
  if (trMatch) {
    const million = parseInt(trMatch[1]) * 1000000;
    const fraction = trMatch[3] ? parseInt(trMatch[3]) * 100000 : 0;
    return million + fraction;
  }
  
  // Định dạng chuẩn có chứa dấu số: ví dụ: 1.500.000 hoặc 600k
  const rawNumMatch = cleanText.match(/(\d+[\d.,]*)/);
  if (rawNumMatch) {
    const rawStr = rawNumMatch[1];
    const indexAfterNum = cleanText.indexOf(rawStr) + rawStr.length;
    const postStr = cleanText.substring(indexAfterNum, indexAfterNum + 5).trim();
    
    const cleanNumStr = rawStr.replace(/[.,]/g, '');
    let val = parseFloat(cleanNumStr);
    
    if (postStr.startsWith('k')) {
      val = val * 1000;
    } else if (postStr.startsWith('triệu') || postStr.startsWith('tr')) {
      val = val * 1000000;
    } else if (val < 10000) {
      // Ước lượng trường hợp viết rút gọn, ví dụ "400/post"
      if (val <= 10) {
        val = val * 1000000;
      } else {
        val = val * 1000;
      }
    }
    return val;
  }
  
  return 0;
}

// Phân tích tỷ lệ tương tác
function parseEngagementRate(rateText) {
  if (!rateText) return 0;
  const cleanText = rateText.trim().replace(/%/g, '').replace(/,/g, '.');
  const val = parseFloat(cleanText);
  return isNaN(val) ? 0 : val;
}

// Trích xuất username an sau từ cột Username hoặc Link Tiktok
function extractUsername(tiktokUrl, displayUsername) {
  if (tiktokUrl) {
    const match = tiktokUrl.match(/@([a-zA-Z0-9_.-]+)/);
    if (match) return match[1].trim();
  }
  if (displayUsername) {
    return displayUsername.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Khử dấu tiếng Việt
      .replace(/[^a-z0-9_.-]/g, '');
  }
  return null;
}

// Ước lượng followers ngẫu nhiên hợp lý nếu trống
function generateRandomFollowers() {
  // Trả về số lượng followers ngẫu nhiên từ 15k đến 180k
  return Math.floor(Math.random() * (180000 - 15000) + 15000);
}

// Chạy Script chính
async function run() {
  const isDryRun = process.env.DRY_RUN === 'true';
  console.log(`=== KHỞI CHẠY IMPORT KOCs (Chế độ: ${isDryRun ? 'DRY_RUN - CHỈ KIỂM TRA' : 'IMPORT THỰC TẾ'}) ===\n`);
  
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Không tìm thấy file CSV tại đường dẫn: ${CSV_PATH}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(CSV_PATH, 'utf-8');
  const allRows = parseCSV(content);
  
  // 1. Tìm dòng header chứa 'Username (TIKTOK)'
  let headerRowIndex = -1;
  for (let i = 0; i < allRows.length; i++) {
    const rowStr = allRows[i].join(' ');
    if (rowStr.includes('Username (TIKTOK)')) {
      headerRowIndex = i;
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    console.error("Không tìm thấy tiêu đề cột 'Username (TIKTOK)' trong file CSV.");
    process.exit(1);
  }
  
  const headers = allRows[headerRowIndex];
  console.log(`Đã tìm thấy dòng Header tại dòng số ${headerRowIndex + 1}:`);
  console.log(headers.map((h, idx) => `  [${idx}] ${h.trim()}`).join('\n'));
  console.log('\n');

  // Xác định index các cột quan trọng
  const idxStt = headers.findIndex(h => h.includes('STT'));
  const idxContact = headers.findIndex(h => h.includes('Kênh liên hệ'));
  const idxUsername = headers.findIndex(h => h.includes('Username (TIKTOK)'));
  const idxTiktokLink = headers.findIndex(h => h.includes('Link Kênh KOC - TIKTOK'));
  const idxInstaLink = headers.findIndex(h => h.includes('Link (INSTAGRAM)'));
  const idxCast = headers.findIndex(h => h.includes('Cast/video'));
  const idxCoopType = headers.findIndex(h => h.includes('Hình thức hợp tác'));
  const idxEngagement = headers.findIndex(h => h.includes('Tỷ lệ tương tác'));
  const idxNote = headers.findIndex(h => h.includes('Ghi chú'));
  const idxNoteLive = headers.findIndex(h => h.includes('NOTE for LIVE'));

  // Lọc lấy các dòng dữ liệu (sau header và STT là số nguyên)
  const dataRows = [];
  for (let i = headerRowIndex + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || row.length === 0) continue;
    
    const sttVal = row[idxStt] ? row[idxStt].trim() : '';
    const usernameVal = row[idxUsername] ? row[idxUsername].trim() : '';
    const tiktokLinkVal = row[idxTiktokLink] ? row[idxTiktokLink].trim() : '';
    
    // Nếu dòng này có số thứ tự STT hợp lệ và có username/tiktok link
    if (/^\d+$/.test(sttVal) && (usernameVal || tiktokLinkVal)) {
      dataRows.push(row);
    }
  }
  
  console.log(`Tổng số dòng dữ liệu KOC hợp lệ tìm thấy: ${dataRows.length} dòng.\n`);
  
  const defaultPassword = 'KOLab2026@';
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash(defaultPassword, salt);
  
  let successCount = 0;
  let errorCount = 0;
  
  // Danh sách email tạm để kiểm tra trùng lặp nội bộ trong file CSV
  const processedEmails = new Set();
  
  for (const row of dataRows) {
    const stt = row[idxStt].trim();
    const rawUsername = row[idxUsername] ? row[idxUsername].trim() : '';
    const tiktokLink = row[idxTiktokLink] ? row[idxTiktokLink].trim() : '';
    const instaLink = row[idxInstaLink] ? row[idxInstaLink].trim() : '';
    const rawCast = row[idxCast] ? row[idxCast].trim() : '';
    const rawCoopType = row[idxCoopType] ? row[idxCoopType].trim() : '';
    const rawEngagement = row[idxEngagement] ? row[idxEngagement].trim() : '';
    const rawNote = row[idxNote] ? row[idxNote].trim() : '';
    const rawNoteLive = row[idxNoteLive] ? row[idxNoteLive].trim() : '';
    const contactChannel = row[idxContact] ? row[idxContact].trim() : '';
    
    // 1. Trích xuất username sạch
    const username = extractUsername(tiktokLink, rawUsername);
    if (!username) {
      console.log(`[Dòng ${stt}] Bỏ qua do không trích xuất được username sạch từ: "${rawUsername}" hoặc "${tiktokLink}"`);
      errorCount++;
      continue;
    }
    
    const email = `${username}@kolab.vn`;
    const displayName = rawUsername || username;
    const servicePrice = parsePrice(rawCast);
    const engagementRate = parseEngagementRate(rawEngagement);
    const followers = generateRandomFollowers();
    
    // Tạo phần Bio tổng hợp thông tin
    let bioParts = [];
    if (rawCoopType) bioParts.push(`Hình thức hợp tác: ${rawCoopType}`);
    if (contactChannel) bioParts.push(`Kênh liên hệ chính: ${contactChannel}`);
    if (rawNote) bioParts.push(`Ghi chú: ${rawNote}`);
    if (rawNoteLive) bioParts.push(`Note Live: ${rawNoteLive}`);
    if (tiktokLink) bioParts.push(`TikTok: ${tiktokLink}`);
    if (instaLink) bioParts.push(`Instagram: ${instaLink}`);
    const bio = bioParts.join('\n');
    
    if (processedEmails.has(email)) {
      console.log(`[Dòng ${stt}] Trùng email nội bộ trong file CSV: ${email}. Bỏ qua.`);
      errorCount++;
      continue;
    }
    processedEmails.add(email);
    
    // In thông tin chi tiết của 5 KOC đầu tiên để review dữ liệu
    if (isDryRun && successCount < 5) {
      console.log(`[DRY RUN - KOC mẫu #${successCount + 1}]`);
      console.log(`  - Username: ${username}`);
      console.log(`  - Email: ${email}`);
      console.log(`  - Display Name: ${displayName}`);
      console.log(`  - Price: ${servicePrice.toLocaleString('vi-VN')} VND (Raw: "${rawCast}")`);
      console.log(`  - Engagement: ${engagementRate}% (Raw: "${rawEngagement}")`);
      console.log(`  - Followers: ${followers.toLocaleString('vi-VN')}`);
      console.log(`  - Bio: \n${bio.split('\n').map(l => '      ' + l).join('\n')}`);
      console.log('----------------------------------------------------');
    }
    
    if (isDryRun) {
      successCount++;
      continue;
    }
    
    // --- LƯU THỰC TẾ VÀO CSDL ---
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      
      // Kiểm tra trùng email trong DB
      const [existingUsers] = await connection.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
      if (existingUsers.length > 0) {
        console.log(`[Dòng ${stt}] Email ${email} đã tồn tại trong Database. Bỏ qua.`);
        errorCount++;
        await connection.rollback();
        continue;
      }
      
      // Chèn bảng users
      const [userResult] = await connection.query(
        `INSERT INTO users (full_name, email, password_hash, role, status, is_verified) 
         VALUES (?, ?, ?, 'koc', 'active', 1)`,
        [displayName, email, defaultPasswordHash]
      );
      
      const userId = userResult.insertId;
      
      // Chèn bảng koc_profiles
      await connection.query(
        `INSERT INTO koc_profiles 
         (user_id, display_name, niche, platform, followers, engagement_rate, service_price, verified, bio, location) 
         VALUES (?, ?, 'Fashion & Beauty', 'TikTok', ?, ?, ?, 1, ?, 'Việt Nam')`,
        [userId, displayName, followers, engagementRate, servicePrice, bio]
      );
      
      await connection.commit();
      successCount++;
      
    } catch (dbError) {
      await connection.rollback();
      console.error(`[Dòng ${stt}] Lỗi khi lưu DB cho KOC ${username}:`, dbError.message);
      errorCount++;
    } finally {
      connection.release();
    }
  }
  
  console.log(`\n=== KẾT QUẢ QUÁ TRÌNH XỬ LÝ ===`);
  console.log(`- Xử lý thành công: ${successCount} KOC`);
  console.log(`- Bỏ qua / lỗi: ${errorCount} KOC`);
  console.log(`- Tổng cộng: ${successCount + errorCount} dòng đã phân tích`);
  console.log(`================================`);
  
  // Đóng pool kết nối để kết thúc script
  await pool.end();
}

run().catch(err => {
  console.error("Lỗi xảy ra trong quá trình chạy script:", err);
  pool.end();
});
