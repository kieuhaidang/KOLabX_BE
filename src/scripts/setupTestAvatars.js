const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const { pool } = require('../config/db');

// Đường dẫn nguồn và đích
const SOURCE_DIR = path.resolve(__dirname, '..', '..', 'koc_data_import');
const DEST_DIR = path.resolve(__dirname, '..', '..', 'uploads');
const CSV_PATH = path.join(SOURCE_DIR, 'Database - Booking.csv');

// --- HÀM TRỢ GIÚP PHÂN TÍCH CSV ---
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
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++;
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
  
  const trMatch = cleanText.match(/(\d+)\s*(tr|triệu)\s*(\d+)?/);
  if (trMatch) {
    const million = parseInt(trMatch[1]) * 1000000;
    const fraction = trMatch[3] ? parseInt(trMatch[3]) * 100000 : 0;
    return million + fraction;
  }
  
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

function parseEngagementRate(rateText) {
  if (!rateText) return 0;
  const cleanText = rateText.trim().replace(/%/g, '').replace(/,/g, '.');
  const val = parseFloat(cleanText);
  return isNaN(val) ? 0 : val;
}

function extractUsername(tiktokUrl, displayUsername) {
  if (tiktokUrl) {
    const match = tiktokUrl.match(/@([a-zA-Z0-9_.-]+)/);
    if (match) return match[1].trim();
  }
  if (displayUsername) {
    return displayUsername.trim().toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9_.-]/g, '');
  }
  return null;
}

function generateRandomFollowers() {
  return Math.floor(Math.random() * (180000 - 15000) + 15000);
}

// --- MAIN FUNCTION ---
async function run() {
  console.log("=== KHỞI CHẠY CẬP NHẬT ẢNH & RE-IMPORT KOC TỪ CSV (CHẾ ĐỘ ĐỘNG) ===\n");
  
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`Không tìm thấy thư mục chứa ảnh và CSV: ${SOURCE_DIR}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`Không tìm thấy file CSV tại đường dẫn: ${CSV_PATH}`);
    process.exit(1);
  }
  
  // Tạo thư mục uploads của dự án nếu chưa tồn tại
  if (!fs.existsSync(DEST_DIR)) {
    fs.mkdirSync(DEST_DIR, { recursive: true });
    console.log(`Đã tạo thư mục uploads: ${DEST_DIR}`);
  }
  
  // 1. Quét động toàn bộ ảnh .jpeg, .jpg, .webp trong thư mục nguồn
  const activeUsernames = [];
  const userExtensionMap = new Map();
  const files = fs.readdirSync(SOURCE_DIR);
  const supportedExtensions = ['.jpeg', '.jpg', '.webp'];
  
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (supportedExtensions.includes(ext)) {
      const username = path.basename(file, ext);
      if (username.startsWith('.')) continue; // Bỏ qua file ẩn
      
      const srcPath = path.join(SOURCE_DIR, file);
      const destPath = path.join(DEST_DIR, file);
      
      try {
        fs.copyFileSync(srcPath, destPath);
        activeUsernames.push(username);
        userExtensionMap.set(username, ext);
        console.log(`[File] Đã quét và sao chép ảnh cho KOC: ${username} (${ext})`);
      } catch (err) {
        console.error(`[File] Lỗi sao chép ảnh ${file}:`, err.message);
      }
    }
  }
  
  console.log(`\nĐã phát hiện tổng cộng ${activeUsernames.length} KOC có ảnh trong thư mục.\n`);
  
  // 2. Đọc file CSV để lấy thông tin KOC tương ứng
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const allRows = parseCSV(csvContent);
  
  let headerRowIndex = -1;
  for (let i = 0; i < allRows.length; i++) {
    const rowStr = allRows[i].join(' ');
    if (rowStr.includes('Username (TIKTOK)')) {
      headerRowIndex = i;
      break;
    }
  }
  
  if (headerRowIndex === -1) {
    console.error("Không tìm thấy dòng Header chứa 'Username (TIKTOK)' trong CSV.");
    process.exit(1);
  }
  
  const headers = allRows[headerRowIndex];
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

  // Trích xuất thông tin KOC từ CSV và lọc chỉ lấy những KOC có ảnh
  const kocDataMap = new Map();
  for (let i = headerRowIndex + 1; i < allRows.length; i++) {
    const row = allRows[i];
    if (!row || row.length === 0) continue;
    
    const sttVal = row[idxStt] ? row[idxStt].trim() : '';
    const rawUsername = row[idxUsername] ? row[idxUsername].trim() : '';
    const tiktokLink = row[idxTiktokLink] ? row[idxTiktokLink].trim() : '';
    
    if (/^\d+$/.test(sttVal) && (rawUsername || tiktokLink)) {
      const username = extractUsername(tiktokLink, rawUsername);
      if (username && activeUsernames.includes(username)) {
        kocDataMap.set(username, {
          rawUsername,
          tiktokLink,
          instaLink: row[idxInstaLink] ? row[idxInstaLink].trim() : '',
          rawCast: row[idxCast] ? row[idxCast].trim() : '',
          rawCoopType: row[idxCoopType] ? row[idxCoopType].trim() : '',
          rawEngagement: row[idxEngagement] ? row[idxEngagement].trim() : '',
          rawNote: row[idxNote] ? row[idxNote].trim() : '',
          rawNoteLive: row[idxNoteLive] ? row[idxNoteLive].trim() : '',
          contactChannel: row[idxContact] ? row[idxContact].trim() : ''
        });
      }
    }
  }
  
  const defaultPassword = 'KOLab2026@';
  const salt = await bcrypt.genSalt(10);
  const defaultPasswordHash = await bcrypt.hash(defaultPassword, salt);
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    let insertCount = 0;
    let updateCount = 0;
    let deleteCount = 0;
    
    // 3. Xử lý re-import / cập nhật cho các KOC có ảnh
    for (const username of activeUsernames) {
      const email = `${username}@kolab.vn`;
      const ext = userExtensionMap.get(username) || '.jpeg';
      const dbAvatarUrl = `/uploads/${username}${ext}`;
      
      const csvData = kocDataMap.get(username) || {
        rawUsername: username,
        tiktokLink: '',
        instaLink: '',
        rawCast: '',
        rawCoopType: '',
        rawEngagement: '',
        rawNote: '',
        rawNoteLive: '',
        contactChannel: ''
      };
      
      const displayName = csvData.rawUsername || username;
      const servicePrice = parsePrice(csvData.rawCast);
      const engagementRate = parseEngagementRate(csvData.rawEngagement);
      const followers = generateRandomFollowers();
      
      let bioParts = [];
      if (csvData.rawCoopType) bioParts.push(`Hình thức hợp tác: ${csvData.rawCoopType}`);
      if (csvData.contactChannel) bioParts.push(`Kênh liên hệ chính: ${csvData.contactChannel}`);
      if (csvData.rawNote) bioParts.push(`Ghi chú: ${csvData.rawNote}`);
      if (csvData.rawNoteLive) bioParts.push(`Note Live: ${csvData.rawNoteLive}`);
      if (csvData.tiktokLink) bioParts.push(`TikTok: ${csvData.tiktokLink}`);
      if (csvData.instaLink) bioParts.push(`Instagram: ${csvData.instaLink}`);
      const bio = bioParts.join('\n');
      
      const [existingUsers] = await connection.query("SELECT id FROM users WHERE email = ? LIMIT 1", [email]);
      
      if (existingUsers.length === 0) {
        // Tài khoản chưa tồn tại (ví dụ như mới được thêm ảnh vào) -> Tiến hành re-import
        const [userResult] = await connection.query(
          `INSERT INTO users (full_name, email, password_hash, role, status, is_verified) 
           VALUES (?, ?, ?, 'koc', 'active', 1)`,
          [displayName, email, defaultPasswordHash]
        );
        
        const userId = userResult.insertId;
        
        await connection.query(
          `INSERT INTO koc_profiles 
           (user_id, display_name, niche, platform, followers, engagement_rate, service_price, verified, bio, location, avatar_url) 
           VALUES (?, ?, 'Fashion & Beauty', 'TikTok', ?, ?, ?, 1, ?, 'Việt Nam', ?)`,
          [userId, displayName, followers, engagementRate, servicePrice, bio, dbAvatarUrl]
        );
        
        console.log(`[CSDL] Tải lại thông tin CSV & Tạo mới thành công: ${username} (${email})`);
        insertCount++;
      } else {
        // Tài khoản đã có sẵn trong CSDL -> Chỉ cần cập nhật avatar_url và đồng bộ thông tin
        const userId = existingUsers[0].id;
        await connection.query(
          `UPDATE koc_profiles 
           SET avatar_url = ?, service_price = ?, engagement_rate = ?, bio = ?, display_name = ?
           WHERE user_id = ?`,
          [dbAvatarUrl, servicePrice, engagementRate, bio, displayName, userId]
        );
        
        console.log(`[CSDL] Đã cập nhật ảnh & đồng bộ thông tin cho KOC: ${username}`);
        updateCount++;
      }
    }
    
    // 4. Tìm và xóa các tài khoản KOC đuôi @kolab.vn không có ảnh
    const [kolabUsers] = await connection.query("SELECT id, email FROM users WHERE email LIKE '%@kolab.vn'");
    for (const user of kolabUsers) {
      const userEmail = user.email;
      const usernameFromEmail = userEmail.split('@')[0];
      
      if (!activeUsernames.includes(usernameFromEmail)) {
        await connection.query("DELETE FROM users WHERE id = ?", [user.id]);
        console.log(`[CSDL] Dọn dẹp tài khoản KOC không có ảnh: ${userEmail}`);
        deleteCount++;
      }
    }
    
    await connection.commit();
    
    console.log(`\n=== KẾT QUẢ THỰC THI ===`);
    console.log(`- Tài KOC mới được tạo lại thành công: ${insertCount} KOC.`);
    console.log(`- Tài KOC cũ được cập nhật & đồng bộ ảnh: ${updateCount} KOC.`);
    console.log(`- Tài khoản KOC không có ảnh bị xóa dọn dẹp: ${deleteCount} KOC.`);
    console.log(`- Tổng KOC hoạt động có ảnh từ đợt import này: ${activeUsernames.length} KOC.`);
    console.log(`========================`);
    
  } catch (dbError) {
    await connection.rollback();
    console.error("Lỗi cơ sở dữ liệu xảy ra, đã rollback transaction:", dbError.message);
  } finally {
    connection.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error("Lỗi thực thi script:", err);
  pool.end();
});
