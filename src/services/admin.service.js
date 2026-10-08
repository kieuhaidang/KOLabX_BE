const { pool } = require("../config/db");
const { ROLES, USER_STATUSES, ASSIGNABLE_ROLES } = require("../constants/roles");

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function mapAdminUserRow(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildWhereClause(filters) {
  const conditions = ["u.role IN (?, ?)"];
  const params = [ROLES.MARKETER, ROLES.KOC];

  if (filters.role) {
    conditions.push("u.role = ?");
    params.push(filters.role);
  }

  if (filters.status) {
    conditions.push("u.status = ?");
    params.push(filters.status);
  }

  if (filters.search) {
    conditions.push("(u.full_name LIKE ? OR u.email LIKE ?)");
    const keyword = `%${filters.search}%`;
    params.push(keyword, keyword);
  }

  return { whereSql: conditions.join(" AND "), params };
}

function buildCampaignWhereClause(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.status) {
    conditions.push("c.status = ?");
    params.push(filters.status);
  }

  if (filters.marketerId) {
    conditions.push("c.marketer_id = ?");
    params.push(filters.marketerId);
  }

  if (filters.search) {
    conditions.push("(c.title LIKE ? OR u.full_name LIKE ? OR u.email LIKE ?)");
    const keyword = `%${filters.search}%`;
    params.push(keyword, keyword, keyword);
  }

  return { whereSql: conditions.join(" AND "), params };
}

function normalizePagination(pagination = {}) {
  const page = Math.max(DEFAULT_PAGE, Number(pagination.page) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(pagination.limit) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

function mapAdminCampaignRow(row) {
  return {
    id: row.id,
    marketerId: row.marketer_id,
    title: row.title,
    description: row.description,
    category: row.category,
    platform: row.platform,
    budget: Number(row.budget || 0),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    marketerName: row.marketer_name,
    marketerEmail: row.marketer_email,
  };
}

async function getDisputeMetrics() {
  try {
    const [[row]] = await pool.query(
      `SELECT
        COUNT(*) AS total_disputes,
        SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_disputes,
        SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) AS under_review_disputes
       FROM disputes`
    );
    return {
      totalDisputes: Number(row?.total_disputes || 0),
      openDisputes: Number(row?.open_disputes || 0),
      underReviewDisputes: Number(row?.under_review_disputes || 0),
    };
  } catch (error) {
    console.warn("[admin] disputes table unavailable:", error.message);
    return { totalDisputes: 0, openDisputes: 0, underReviewDisputes: 0 };
  }
}

async function getAdminDashboardBundle() {
  const [dashboard, earningsSummary, disputeMetrics] = await Promise.all([
    getDashboardSummary(),
    getAdminEarningsSummary(),
    getDisputeMetrics(),
  ]);

  return {
    ...dashboard,
    earningsSummary,
    disputeMetrics,
  };
}

async function getDashboardSummary() {
  const [[summaryRow]] = await pool.query(
    `SELECT
      (SELECT COUNT(*) FROM users) AS total_users,
      (SELECT COUNT(*) FROM users WHERE role = 'marketer') AS total_marketers,
      (SELECT COUNT(*) FROM users WHERE role = 'koc') AS total_kocs,
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS active_users,
      (SELECT COUNT(*) FROM campaigns) AS total_campaigns,
      (SELECT COUNT(*) FROM campaigns WHERE status = 'open') AS open_campaigns,
      (SELECT COUNT(*) FROM bookings) AS total_bookings,
      (SELECT COUNT(*) FROM bookings WHERE status = 'pending') AS pending_bookings,
      (SELECT COALESCE(SUM(amount), 0) FROM earnings) AS total_earnings,
      (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE status = 'paid') AS paid_earnings,
      (SELECT COALESCE(SUM(amount), 0) FROM earnings WHERE status = 'pending') AS pending_earnings`
  );

  const [recentUsersRows] = await pool.query(
    `SELECT id, full_name, email, role, status, created_at, updated_at
     FROM users
     ORDER BY created_at DESC
     LIMIT 5`
  );

  const [recentCampaignRows] = await pool.query(
    `SELECT c.id, c.title, c.status, c.platform, c.budget, c.created_at, u.full_name AS marketer_name
     FROM campaigns c
     INNER JOIN users u ON u.id = c.marketer_id
     ORDER BY c.created_at DESC
     LIMIT 5`
  );

  const [bookingStatusRows] = await pool.query(
    `SELECT status, COUNT(*) AS count
     FROM bookings
     GROUP BY status
     ORDER BY count DESC`
  );

  return {
    metrics: {
      totalUsers: Number(summaryRow?.total_users || 0),
      totalMarketers: Number(summaryRow?.total_marketers || 0),
      totalKocs: Number(summaryRow?.total_kocs || 0),
      activeUsers: Number(summaryRow?.active_users || 0),
      totalCampaigns: Number(summaryRow?.total_campaigns || 0),
      openCampaigns: Number(summaryRow?.open_campaigns || 0),
      totalBookings: Number(summaryRow?.total_bookings || 0),
      pendingBookings: Number(summaryRow?.pending_bookings || 0),
      totalEarnings: Number(summaryRow?.total_earnings || 0),
      paidEarnings: Number(summaryRow?.paid_earnings || 0),
      pendingEarnings: Number(summaryRow?.pending_earnings || 0),
    },
    recentUsers: recentUsersRows.map(mapAdminUserRow),
    recentCampaigns: recentCampaignRows.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      platform: row.platform,
      budget: Number(row.budget || 0),
      createdAt: row.created_at,
      marketerName: row.marketer_name,
    })),
    bookingStatusBreakdown: bookingStatusRows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0),
    })),
  };
}

async function listUsers(filters, pagination = {}) {
  const { whereSql, params } = buildWhereClause(filters);
  const { page, limit, offset } = normalizePagination(pagination);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM users u WHERE ${whereSql}`,
    params
  );
  const total = Number(countRow?.total || 0);

  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.role, u.status, u.created_at, u.updated_at
     FROM users u
     WHERE ${whereSql}
     ORDER BY u.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapAdminUserRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

async function getUserById(userId) {
  const [rows] = await pool.query(
    `SELECT id, full_name, email, role, status, created_at, updated_at
     FROM users
     WHERE id = ? AND role IN (?, ?)
     LIMIT 1`,
    [userId, ROLES.MARKETER, ROLES.KOC]
  );
  return rows[0] ? mapAdminUserRow(rows[0]) : null;
}

async function updateUserStatus(userId, status) {
  const existing = await getUserById(userId);
  if (!existing) {
    return null;
  }

  if (existing.role === ROLES.OWNER || existing.role === ROLES.ADMIN) {
    const error = new Error("Cannot modify admin or owner accounts");
    error.status = 403;
    throw error;
  }

  await pool.query("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
  return getUserById(userId);
}

async function banUser(userId) {
  return updateUserStatus(userId, USER_STATUSES.BANNED);
}

async function unbanUser(userId) {
  return updateUserStatus(userId, USER_STATUSES.ACTIVE);
}

async function updateUserRole(userId, role) {
  if (!ASSIGNABLE_ROLES.includes(role)) {
    const error = new Error("Invalid role. Only marketer or koc can be assigned.");
    error.status = 400;
    throw error;
  }

  const existing = await getUserById(userId);
  if (!existing) {
    return null;
  }

  if (existing.role === ROLES.OWNER) {
    const error = new Error("Cannot modify owner accounts");
    error.status = 403;
    throw error;
  }

  if (existing.role === ROLES.ADMIN) {
    const error = new Error("Cannot change role of an admin account");
    error.status = 403;
    throw error;
  }

  await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  return getUserById(userId);
}

async function listCampaigns(filters, pagination = {}) {
  const { whereSql, params } = buildCampaignWhereClause(filters);
  const { page, limit, offset } = normalizePagination(pagination);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total
     FROM campaigns c
     INNER JOIN users u ON u.id = c.marketer_id
     WHERE ${whereSql}`,
    params
  );
  const total = Number(countRow?.total || 0);

  const [rows] = await pool.query(
    `SELECT
      c.id,
      c.marketer_id,
      c.title,
      c.description,
      c.category,
      c.platform,
      c.budget,
      c.status,
      c.created_at,
      c.updated_at,
      u.full_name AS marketer_name,
      u.email AS marketer_email
     FROM campaigns c
     INNER JOIN users u ON u.id = c.marketer_id
     WHERE ${whereSql}
     ORDER BY c.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapAdminCampaignRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

async function getReportsOverview() {
  const [monthlyRevenueRows] = await pool.query(
    `SELECT
      DATE_FORMAT(created_at, '%Y-%m') AS month_key,
      DATE_FORMAT(created_at, '%m/%Y') AS label,
      COUNT(*) AS bookings_count,
      COALESCE(SUM(amount), 0) AS total_amount,
      COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) AS paid_amount
     FROM earnings
     GROUP BY month_key, label
     ORDER BY month_key DESC
     LIMIT 6`
  );

  const [topKocRows] = await pool.query(
    `SELECT
      u.id,
      u.full_name,
      COUNT(e.id) AS booking_count,
      COALESCE(SUM(e.amount), 0) AS total_amount
     FROM earnings e
     INNER JOIN users u ON u.id = e.koc_id
     GROUP BY u.id, u.full_name
     ORDER BY total_amount DESC
     LIMIT 5`
  );

  const [topMarketerRows] = await pool.query(
    `SELECT
      u.id,
      u.full_name,
      COUNT(c.id) AS campaign_count,
      COALESCE(SUM(c.budget), 0) AS total_budget
     FROM campaigns c
     INNER JOIN users u ON u.id = c.marketer_id
     GROUP BY u.id, u.full_name
     ORDER BY total_budget DESC
     LIMIT 5`
  );

  const [campaignStatusRows] = await pool.query(
    `SELECT status, COUNT(*) AS count
     FROM campaigns
     GROUP BY status
     ORDER BY count DESC`
  );

  const [platformRows] = await pool.query(
    `SELECT platform, COUNT(*) AS count
     FROM campaigns
     WHERE platform IS NOT NULL AND platform <> ''
     GROUP BY platform
     ORDER BY count DESC`
  );

  return {
    monthlyRevenue: monthlyRevenueRows
      .map((row) => ({
        label: row.label,
        bookingsCount: Number(row.bookings_count || 0),
        totalAmount: Number(row.total_amount || 0),
        paidAmount: Number(row.paid_amount || 0),
      }))
      .reverse(),
    topKocs: topKocRows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      bookingCount: Number(row.booking_count || 0),
      totalAmount: Number(row.total_amount || 0),
    })),
    topMarketers: topMarketerRows.map((row) => ({
      id: row.id,
      fullName: row.full_name,
      campaignCount: Number(row.campaign_count || 0),
      totalBudget: Number(row.total_budget || 0),
    })),
    campaignStatusBreakdown: campaignStatusRows.map((row) => ({
      status: row.status,
      count: Number(row.count || 0),
    })),
    platformBreakdown: platformRows.map((row) => ({
      platform: row.platform,
      count: Number(row.count || 0),
    })),
  };
}

/**
 * Reads platform_fee_percent from platform_settings (required for profit split).
 * Falls back to 0 if table/row is missing — run migration 004 if needed.
 */
async function fetchPlatformFeePercent() {
  try {
    const [rows] = await pool.query(
      "SELECT platform_fee_percent FROM platform_settings ORDER BY id ASC LIMIT 1"
    );
    if (rows[0]) {
      return Number(rows[0].platform_fee_percent || 0);
    }
  } catch (error) {
    console.warn("[earnings-summary] platform_settings unavailable, using 0% fee:", error.message);
  }
  return 0;
}

/**
 * Platform revenue summary (admin + owner dashboards).
 * - grossRevenue: SUM(earnings.amount) excluding cancelled
 * - platformProfit: SUM(amount * platform_fee_percent / 100)
 * - creatorCommission (KOC net): SUM(amount * (1 - platform_fee_percent / 100))
 * - pendingAmount: KOC net for status = pending only
 */
async function getAdminEarningsSummary() {
  const platformFeePercent = await fetchPlatformFeePercent();
  const feeRate = platformFeePercent / 100;
  const kocRate = 1 - feeRate;

  const [[row]] = await pool.query(
    `SELECT
      COUNT(e.id) AS total_records,
      COALESCE(SUM(CASE WHEN e.status <> 'cancelled' THEN e.amount ELSE 0 END), 0) AS gross_revenue,
      COALESCE(SUM(
        CASE WHEN e.status <> 'cancelled' THEN e.amount * ? ELSE 0 END
      ), 0) AS platform_profit,
      COALESCE(SUM(
        CASE WHEN e.status <> 'cancelled' THEN e.amount * ? ELSE 0 END
      ), 0) AS koc_net_payout,
      COALESCE(SUM(
        CASE WHEN e.status = 'paid' THEN e.amount * ? ELSE 0 END
      ), 0) AS paid_amount,
      COALESCE(SUM(
        CASE WHEN e.status = 'pending' THEN e.amount * ? ELSE 0 END
      ), 0) AS pending_amount
     FROM earnings e`,
    [feeRate, kocRate, kocRate, kocRate]
  );

  const grossRevenue = Number(row?.gross_revenue || 0);
  const platformProfit = Number(row?.platform_profit || 0);
  const kocNetPayout = Number(row?.koc_net_payout || 0);
  const paidAmount = Number(row?.paid_amount || 0);
  const pendingAmount = Number(row?.pending_amount || 0);

  console.log("[earnings-summary]", {
    grossRevenue,
    platformFeePercent,
    platformProfit,
    kocNetPayout,
  });

  return {
    grossRevenue,
    creatorCommission: kocNetPayout,
    platformProfit,
    paidAmount,
    pendingAmount,
    totalRecords: Number(row?.total_records || 0),
    platformFeePercent,
  };
}

async function listDetailedEarnings() {
  const [rows] = await pool.query(
    `SELECT
      e.id,
      e.booking_id,
      e.koc_id,
      e.amount,
      e.status,
      e.paid_at,
      e.created_at,
      e.updated_at,
      koc.full_name AS koc_name,
      marketer.full_name AS marketer_name,
      c.title AS campaign_title
     FROM earnings e
     INNER JOIN bookings b ON b.id = e.booking_id
     INNER JOIN campaigns c ON c.id = b.campaign_id
     INNER JOIN users koc ON koc.id = e.koc_id
     INNER JOIN users marketer ON marketer.id = b.marketer_id
     ORDER BY e.created_at DESC`
  );

  return rows.map((row) => ({
    id: row.id,
    bookingId: row.booking_id,
    kocId: row.koc_id,
    amount: Number(row.amount || 0),
    status: row.status,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    kocName: row.koc_name,
    marketerName: row.marketer_name,
    campaignTitle: row.campaign_title,
  }));
}

module.exports = {
  getDashboardSummary,
  getAdminDashboardBundle,
  getDisputeMetrics,
  listUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  banUser,
  unbanUser,
  listCampaigns,
  getReportsOverview,
  getAdminEarningsSummary,
  listDetailedEarnings,
};
