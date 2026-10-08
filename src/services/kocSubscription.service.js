const { pool } = require("../config/db");

const PLANS = {
  FREE: "free",
  PLUS: "plus",
};

function firstDayOfNextMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 1, 0, 0, 0, 0);
}

async function ensureMonthlyReset(userId) {
  const [rows] = await pool.query(
    `SELECT plan, ai_monthly_limit, ai_used_this_month, ai_usage_reset_at, is_search_boosted
     FROM koc_profiles
     WHERE user_id = ?
     LIMIT 1`,
    [userId]
  );
  const current = rows[0];
  if (!current) {
    const error = new Error("KOC profile not found");
    error.status = 404;
    throw error;
  }

  const now = new Date();
  const resetAt = current.ai_usage_reset_at ? new Date(current.ai_usage_reset_at) : null;
  if (!resetAt || Number.isNaN(resetAt.getTime()) || now >= resetAt) {
    const nextReset = firstDayOfNextMonth(now);
    await pool.query(
      `UPDATE koc_profiles
       SET ai_used_this_month = 0, ai_usage_reset_at = ?
       WHERE user_id = ?`,
      [nextReset, userId]
    );
    return {
      ...current,
      ai_used_this_month: 0,
      ai_usage_reset_at: nextReset,
    };
  }

  return current;
}

function resolveLimit(row) {
  if (row.plan === PLANS.PLUS) return 100;
  const limit = Number(row.ai_monthly_limit);
  return Number.isFinite(limit) && limit > 0 ? limit : 5;
}

async function getSubscription(userId) {
  const row = await ensureMonthlyReset(userId);
  const limit = resolveLimit(row);
  const used = Number(row.ai_used_this_month || 0);
  return {
    plan: row.plan || PLANS.FREE,
    limit,
    used,
    remaining: Math.max(0, limit - used),
    resetAt: row.ai_usage_reset_at,
    isSearchBoosted: Boolean(row.is_search_boosted || 0),
  };
}

async function getQuota(userId) {
  const subscription = await getSubscription(userId);
  return {
    plan: subscription.plan,
    aiMonthlyLimit: subscription.limit,
    aiUsedThisMonth: subscription.used,
    remaining: subscription.remaining,
    isSearchBoosted: subscription.isSearchBoosted,
    resetAt: subscription.resetAt,
  };
}

async function consumeScriptDoctorUsage(userId) {
  const row = await ensureMonthlyReset(userId);
  const limit = resolveLimit(row);
  const used = Number(row.ai_used_this_month || 0);

  if (used >= limit) {
    const error = new Error(
      "Bạn đã hết lượt AI trong tháng. Nâng cấp Plus để nhận thêm lượt và được ưu tiên hiển thị."
    );
    error.status = 403;
    throw error;
  }

  await pool.query(
    `UPDATE koc_profiles
     SET ai_used_this_month = ai_used_this_month + 1
     WHERE user_id = ?`,
    [userId]
  );

  return {
    plan: row.plan || PLANS.FREE,
    limit,
    used: used + 1,
    resetAt: row.ai_usage_reset_at,
    isSearchBoosted: Boolean(row.is_search_boosted || 0),
  };
}

async function upgradeToPlus(userId) {
  const nextReset = firstDayOfNextMonth(new Date());
  await pool.query(
    `UPDATE koc_profiles
     SET plan = ?, ai_monthly_limit = 100, is_search_boosted = 1, ai_usage_reset_at = COALESCE(ai_usage_reset_at, ?)
     WHERE user_id = ?`,
    [PLANS.PLUS, nextReset, userId]
  );
  return getSubscription(userId);
}

module.exports = {
  PLANS,
  getSubscription,
  getQuota,
  consumeScriptDoctorUsage,
  upgradeToPlus,
};

