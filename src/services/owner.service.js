const { pool } = require("../config/db");
const adminService = require("./admin.service");
const { ROLES, USER_STATUSES, OWNER_ADMIN_ASSIGNABLE_ROLES } = require("../constants/roles");

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

function buildAdminWhereClause(filters) {
  const conditions = ["u.role = ?"];
  const params = [ROLES.ADMIN];

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

function normalizePagination(pagination = {}) {
  const page = Math.max(DEFAULT_PAGE, Number(pagination.page) || DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(pagination.limit) || DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function mapPlatformSettingsRow(row) {
  return {
    id: row.id,
    platformFeePercent: Number(row.platform_fee_percent),
    kocPayoutPercent: Number(row.koc_payout_percent),
    payoutDelayDays: Number(row.payout_delay_days),
    autoReleaseEnabled: Boolean(row.auto_release_enabled),
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAuditLogRow(row) {
  return {
    id: Number(row.id),
    actorId: row.actor_id,
    actorRole: row.actor_role,
    action: row.action,
    targetType: row.target_type,
    targetId: row.target_id,
    description: row.description,
    createdAt: row.created_at,
  };
}

async function getOwnerDashboard() {
  const dashboard = await adminService.getDashboardSummary();
  const earningsSummary = await adminService.getAdminEarningsSummary();

  const [[disputeRow]] = await pool.query(
    `SELECT
      COUNT(*) AS total_disputes,
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS open_disputes,
      SUM(CASE WHEN status = 'under_review' THEN 1 ELSE 0 END) AS under_review_disputes
     FROM disputes`
  );

  const [[adminRow]] = await pool.query(
    `SELECT
      COUNT(*) AS total_admins,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_admins
     FROM users WHERE role = ?`,
    [ROLES.ADMIN]
  );

  let recentAuditLogs = [];
  try {
    const auditData = await listAuditLogs({}, { page: 1, limit: 5 });
    recentAuditLogs = auditData.items;
  } catch (error) {
    console.warn("[owner] audit_logs unavailable:", error.message);
  }

  const financialSettings = await getFinancialSettings();

  return {
    metrics: {
      ...dashboard.metrics,
      totalAdmins: Number(adminRow?.total_admins || 0),
      activeAdmins: Number(adminRow?.active_admins || 0),
      totalDisputes: Number(disputeRow?.total_disputes || 0),
      openDisputes: Number(disputeRow?.open_disputes || 0),
      underReviewDisputes: Number(disputeRow?.under_review_disputes || 0),
    },
    recentUsers: dashboard.recentUsers,
    recentCampaigns: dashboard.recentCampaigns,
    bookingStatusBreakdown: dashboard.bookingStatusBreakdown,
    earningsSummary,
    disputeMetrics: {
      totalDisputes: Number(disputeRow?.total_disputes || 0),
      openDisputes: Number(disputeRow?.open_disputes || 0),
      underReviewDisputes: Number(disputeRow?.under_review_disputes || 0),
    },
    financialSettings,
    recentAuditLogs,
  };
}

async function listAdmins(filters, pagination = {}) {
  const { whereSql, params } = buildAdminWhereClause(filters);
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

async function getAdminById(userId) {
  const [rows] = await pool.query(
    "SELECT id, full_name, email, role, status, created_at, updated_at FROM users WHERE id = ? AND role = ? LIMIT 1",
    [userId, ROLES.ADMIN]
  );
  return rows[0] ? mapAdminUserRow(rows[0]) : null;
}

async function updateAdminStatus(userId, status) {
  const existing = await getAdminById(userId);
  if (!existing) {
    return null;
  }

  await pool.query("UPDATE users SET status = ? WHERE id = ?", [status, userId]);
  return getAdminById(userId);
}

async function updateAdminRole(userId, role) {
  if (!OWNER_ADMIN_ASSIGNABLE_ROLES.includes(role)) {
    const error = new Error("Invalid role for admin account");
    error.status = 400;
    throw error;
  }

  const [rows] = await pool.query(
    "SELECT id, role FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  const row = rows[0];
  if (!row) {
    return null;
  }

  if (row.role === ROLES.OWNER) {
    const error = new Error("Cannot change role of an owner account");
    error.status = 403;
    throw error;
  }

  if (row.role !== ROLES.ADMIN) {
    const error = new Error("Target user is not an admin account");
    error.status = 400;
    throw error;
  }

  await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  const [updatedRows] = await pool.query(
    "SELECT id, full_name, email, role, status, created_at, updated_at FROM users WHERE id = ? LIMIT 1",
    [userId]
  );
  return updatedRows[0] ? mapAdminUserRow(updatedRows[0]) : null;
}

async function getFinancialSettings() {
  const [rows] = await pool.query(
    `SELECT id, platform_fee_percent, koc_payout_percent, payout_delay_days, auto_release_enabled, updated_by, created_at, updated_at
     FROM platform_settings
     ORDER BY id ASC
     LIMIT 1`
  );
  return rows[0] ? mapPlatformSettingsRow(rows[0]) : null;
}

async function updateFinancialSettings(payload, updatedByUserId) {
  const existing = await getFinancialSettings();
  if (!existing) {
    const error = new Error("Platform settings not found");
    error.status = 404;
    throw error;
  }

  const platformFeePercent = payload.platformFeePercent ?? existing.platformFeePercent;
  const kocPayoutPercent = payload.kocPayoutPercent ?? existing.kocPayoutPercent;
  const payoutDelayDays = payload.payoutDelayDays ?? existing.payoutDelayDays;
  const autoReleaseEnabled =
    payload.autoReleaseEnabled !== undefined ? (payload.autoReleaseEnabled ? 1 : 0) : existing.autoReleaseEnabled ? 1 : 0;

  await pool.query(
    `UPDATE platform_settings
     SET platform_fee_percent = ?, koc_payout_percent = ?, payout_delay_days = ?, auto_release_enabled = ?, updated_by = ?
     WHERE id = ?`,
    [platformFeePercent, kocPayoutPercent, payoutDelayDays, autoReleaseEnabled, updatedByUserId, existing.id]
  );

  return getFinancialSettings();
}

function buildAuditWhereClause(filters) {
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.action) {
    conditions.push("action = ?");
    params.push(filters.action);
  }

  if (filters.targetType) {
    conditions.push("target_type = ?");
    params.push(filters.targetType);
  }

  if (filters.actorId) {
    conditions.push("actor_id = ?");
    params.push(filters.actorId);
  }

  if (filters.search) {
    conditions.push("(description LIKE ? OR action LIKE ? OR target_id LIKE ?)");
    const keyword = `%${filters.search}%`;
    params.push(keyword, keyword, keyword);
  }

  return { whereSql: conditions.join(" AND "), params };
}

async function listAuditLogs(filters, pagination = {}) {
  const { whereSql, params } = buildAuditWhereClause(filters);
  const { page, limit, offset } = normalizePagination(pagination);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM audit_logs WHERE ${whereSql}`,
    params
  );
  const total = Number(countRow?.total || 0);

  const [rows] = await pool.query(
    `SELECT id, actor_id, actor_role, action, target_type, target_id, description, created_at
     FROM audit_logs
     WHERE ${whereSql}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );

  return {
    items: rows.map(mapAuditLogRow),
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

module.exports = {
  getOwnerDashboard,
  listAdmins,
  getAdminById,
  updateAdminStatus,
  updateAdminRole,
  getFinancialSettings,
  updateFinancialSettings,
  listAuditLogs,
};
