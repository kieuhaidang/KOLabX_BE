const { pool } = require("../config/db");

let campaignColumnsCache = null;

async function getCampaignColumns() {
  if (campaignColumnsCache) return campaignColumnsCache;

  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'campaigns'`
  );

  campaignColumnsCache = new Set(rows.map((row) => row.COLUMN_NAME));
  return campaignColumnsCache;
}

// Hàm chuẩn hóa ngày tháng sang chuẩn UTC để lưu vào MySQL
function toMysqlDatetime(dateInput) {
  if (!dateInput) return null;
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return null;
  // Trả về chuỗi YYYY-MM-DD HH:mm:ss ở múi giờ UTC
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function mapCampaignRow(row) {
  return {
    id: row.id,
    marketerId: row.marketer_id,
    title: row.title,
    description: row.description,
    category: row.category,
    platform: row.platform,
    targetFollowersMin: row.target_followers_min,
    targetFollowersMax: row.target_followers_max,
    targetEngagementMin: Number(row.target_engagement_min || 0),
    budget: Number(row.budget || 0),
    remainingBudget: Number(row.remaining_budget || 0),
    totalDeposited: Number(row.total_deposited || 0),
    status: row.status,
    // Trả về định dạng ISO để Frontend tự chuyển múi giờ người dùng
    startDate: row.start_date ? new Date(row.start_date).toISOString() : null,
    endDate: row.end_date ? new Date(row.end_date).toISOString() : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Trạng thái ứng tuyển (nếu có)
    myBookingStatus: row.my_booking_status || null,
    myBookingId: row.my_booking_id || null,
    productName: row.product_name || null,
    productDescription: row.product_description || null,
    productImages: row.product_images ? (typeof row.product_images === 'string' ? JSON.parse(row.product_images) : row.product_images) : [],
  };
}

async function autoTransitionStatus() {
  const columns = await getCampaignColumns();
  if (!columns.has("start_date")) return;

  // Chuyển scheduled -> open khi đến ngày bắt đầu (so sánh theo giờ chuẩn UTC)
  await pool.query(
    "UPDATE campaigns SET status = 'open' WHERE status = 'scheduled' AND start_date <= UTC_TIMESTAMP()"
  );
}

async function createCampaign(marketerId, payload, executor = pool) {
  const columns = await getCampaignColumns();
  const now = new Date();
  const startDate = payload.start_date ? new Date(payload.start_date) : now;
  let finalStatus = startDate > now ? "scheduled" : "open";

  const fields = [
    "marketer_id",
    "title",
    "description",
    "category",
    "platform",
    "target_followers_min",
    "target_followers_max",
    "target_engagement_min",
    "budget",
    "status",
  ];
  const values = [
    marketerId,
    payload.title,
    payload.description || null,
    payload.category || null,
    payload.platform || null,
    payload.target_followers_min || 0,
    payload.target_followers_max || 0,
    payload.target_engagement_min || 0,
    payload.budget || 0,
    finalStatus,
  ];

  if (columns.has("start_date")) {
    fields.push("start_date");
    values.push(toMysqlDatetime(payload.start_date));
  }
  if (columns.has("end_date")) {
    fields.push("end_date");
    values.push(toMysqlDatetime(payload.end_date));
  }
  if (columns.has("product_name")) {
    fields.push("product_name");
    values.push(payload.product_name || null);
  }
  if (columns.has("product_description")) {
    fields.push("product_description");
    values.push(payload.product_description || null);
  }
  if (columns.has("product_images")) {
    fields.push("product_images");
    values.push(payload.product_images ? JSON.stringify(payload.product_images) : null);
  }

  const placeholders = fields.map(() => "?").join(", ");
  const [result] = await executor.query(
    `INSERT INTO campaigns (${fields.join(", ")}) VALUES (${placeholders})`,
    values
  );
  const [rows] = await executor.query("SELECT * FROM campaigns WHERE id = ? LIMIT 1", [result.insertId]);
  return rows[0] ? mapCampaignRow(rows[0]) : null;
}

async function listCampaigns(filters) {
  await autoTransitionStatus();
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.status) {
    conditions.push("status = ?");
    params.push(filters.status);
  }
  if (filters.marketerId) {
    conditions.push("marketer_id = ?");
    params.push(filters.marketerId);
  }
  if (filters.platform) {
    conditions.push("platform = ?");
    params.push(filters.platform);
  }
  if (filters.category) {
    conditions.push("category = ?");
    params.push(filters.category);
  }

  const [rows] = await pool.query(
    `SELECT *, 
            (SELECT COALESCE(SUM(amount), 0) 
             FROM payments 
             WHERE campaign_id = campaigns.id AND status = 'confirmed') AS total_deposited
     FROM campaigns WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC`,
    params
  );
  return rows.map(mapCampaignRow);
}

async function getCampaignById(id) {
  await autoTransitionStatus();
  const [rows] = await pool.query(
    `SELECT *, 
            (SELECT COALESCE(SUM(amount), 0) 
             FROM payments 
             WHERE campaign_id = campaigns.id AND status = 'confirmed') AS total_deposited
     FROM campaigns WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ? mapCampaignRow(rows[0]) : null;
}

async function updateCampaign(id, payload) {
  const columns = await getCampaignColumns();
  const fields = [];
  const params = [];

  const dateFields = ['start_date', 'end_date'].filter((field) => columns.has(field));
  const otherFields = [
    'title', 'description', 'category', 'platform', 
    'target_followers_min', 'target_followers_max', 
    'target_engagement_min', 'budget', 'status',
    'product_name', 'product_description', 'product_images'
  ];

  for (const field of otherFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = ?`);
      let val = payload[field];
      if (field === 'product_images' && Array.isArray(val)) {
        val = JSON.stringify(val);
      }
      params.push(val);
    }
  }

  for (const field of dateFields) {
    if (payload[field] !== undefined) {
      fields.push(`${field} = ?`);
      params.push(toMysqlDatetime(payload[field]));
    }
  }

  if (fields.length === 0) return getCampaignById(id);

  params.push(id);
  
  // Get current marketer_id and status of campaign
  const [campaignRows] = await pool.query("SELECT marketer_id, status, remaining_budget, title FROM campaigns WHERE id = ?", [id]);
  const currentCampaign = campaignRows[0];

  await pool.query(`UPDATE campaigns SET ${fields.join(", ")} WHERE id = ?`, params);

  // If status transitions to 'completed' or 'cancelled', check and refund remaining budget to wallet
  if (payload.status && ['completed', 'cancelled'].includes(payload.status) && currentCampaign && currentCampaign.status !== payload.status) {
    const refundAmt = Number(currentCampaign.remaining_budget || 0);
    if (refundAmt > 0) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        
        // Ensure wallet exists
        await connection.query(
          "INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0.00)",
          [currentCampaign.marketer_id]
        );
        
        // Add to wallet balance
        await connection.query(
          "UPDATE wallets SET balance = balance + ? WHERE user_id = ?",
          [refundAmt, currentCampaign.marketer_id]
        );
        
        // Get wallet ID
        const [[walletRow]] = await connection.query("SELECT id FROM wallets WHERE user_id = ?", [currentCampaign.marketer_id]);
        
        // Insert transaction
        await connection.query(
          `INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, description)
           VALUES (?, ?, 'refund', ?, ?)`,
          [walletRow.id, refundAmt, id, `Hoàn trả ngân sách dư của chiến dịch #${id} (${currentCampaign.title})`]
        );
        
        // Set remaining_budget to 0
        await connection.query("UPDATE campaigns SET remaining_budget = 0.00 WHERE id = ?", [id]);
        
        await connection.commit();
      } catch (walletErr) {
        await connection.rollback();
        console.error("Wallet refund error:", walletErr);
      } finally {
        connection.release();
      }
    }
  }

  return getCampaignById(id);
}

async function deleteCampaign(id, marketerId) {
  const columns = await getCampaignColumns();
  const startDateSelect = columns.has("start_date") ? "start_date" : "created_at AS start_date";
  const [rows] = await pool.query(
    `SELECT ${startDateSelect}, status FROM campaigns WHERE id = ? AND marketer_id = ?`,
    [id, marketerId]
  );
  
  if (rows.length === 0) return false;

  const campaign = rows[0];
  const now = new Date();
  const startDate = new Date(campaign.start_date);

  const activeStatuses = ['open', 'paused', 'in_progress', 'completed'];
  const isStarted = now >= startDate;
  const isActive = activeStatuses.includes(campaign.status);

  if (isStarted || isActive) {
    throw new Error("Chiến dịch đang trong thời gian chạy, đã chạy hoặc đang hoạt động, không thể xóa. Bạn chỉ có thể tạm dừng hoặc hủy.");
  }

  const [result] = await pool.query(
    "DELETE FROM campaigns WHERE id = ? AND marketer_id = ?",
    [id, marketerId]
  );
  return result.affectedRows > 0;
}

async function listAvailableCampaigns(kocId, filters = {}) {
  await autoTransitionStatus();
  const conditions = ["c.status IN ('open', 'scheduled')"];
  const params = [kocId];

  if (filters.platform) {
    conditions.push("c.platform = ?");
    params.push(filters.platform);
  }
  if (filters.category) {
    conditions.push("c.category = ?");
    params.push(filters.category);
  }

  const [rows] = await pool.query(
    `SELECT c.*, b.status as my_booking_status, b.id as my_booking_id
     FROM campaigns c
     LEFT JOIN bookings b ON c.id = b.campaign_id AND b.koc_id = ? AND b.status != 'cancelled'
     WHERE ${conditions.join(" AND ")}
     ORDER BY c.created_at DESC`,
    params
  );
  return rows.map(mapCampaignRow);
}

module.exports = {
  createCampaign,
  listCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  listAvailableCampaigns,
};
