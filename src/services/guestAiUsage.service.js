const crypto = require("crypto");
const { pool } = require("../config/db");
const { GUEST_AI_TRIAL_LIMIT, GUEST_AI_FEATURES } = require("../constants/guestAi");

const PENDING_EXPIRY_SECONDS = 90;
const REQUEST_COOLDOWN_SECONDS = 2;
const VALID_FEATURES = new Set(Object.values(GUEST_AI_FEATURES));

class GuestAiUsageError extends Error {
  constructor(message, code, status = 429) {
    super(message);
    this.name = "GuestAiUsageError";
    this.code = code;
    this.status = status;
  }
}

function validateGuestId(value) {
  const guestId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(guestId)) {
    throw new GuestAiUsageError("Guest id không hợp lệ.", "INVALID_GUEST_ID", 400);
  }
  return guestId;
}

function validateFeature(feature) {
  if (!VALID_FEATURES.has(feature)) {
    throw new GuestAiUsageError("Tính năng dùng thử không hợp lệ.", "INVALID_GUEST_FEATURE", 400);
  }
  return feature;
}

function hashGuestId(guestId) {
  return crypto.createHash("sha256").update(guestId).digest("hex");
}

function quotaFromUsed(used) {
  const normalizedUsed = Math.max(0, Number(used) || 0);
  return {
    limit: GUEST_AI_TRIAL_LIMIT,
    used: normalizedUsed,
    remaining: Math.max(0, GUEST_AI_TRIAL_LIMIT - normalizedUsed),
    requiresAuth: normalizedUsed >= GUEST_AI_TRIAL_LIMIT,
  };
}

async function getQuota(guestIdValue, featureValue) {
  const guestId = validateGuestId(guestIdValue);
  const feature = validateFeature(featureValue);
  const guestHash = hashGuestId(guestId);
  const [rows] = await pool.query(
    "SELECT usage_count FROM guest_ai_usage WHERE guest_key_hash = ? AND feature = ? LIMIT 1",
    [guestHash, feature]
  );
  return quotaFromUsed(rows[0]?.usage_count || 0);
}

async function beginRequest(guestIdValue, featureValue) {
  const guestId = validateGuestId(guestIdValue);
  const feature = validateFeature(featureValue);
  const guestHash = hashGuestId(guestId);
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query(
      `INSERT IGNORE INTO guest_ai_usage (guest_key_hash, feature)
       VALUES (?, ?)`,
      [guestHash, feature]
    );
    const [rows] = await connection.query(
      `SELECT usage_count, pending_count, pending_updated_at, last_request_at,
              TIMESTAMPDIFF(SECOND, last_request_at, NOW()) AS seconds_since_request,
              TIMESTAMPDIFF(SECOND, pending_updated_at, NOW()) AS pending_age
       FROM guest_ai_usage
       WHERE guest_key_hash = ? AND feature = ?
       FOR UPDATE`,
      [guestHash, feature]
    );
    const row = rows[0];
    let pending = Number(row.pending_count) || 0;

    if (pending > 0 && Number(row.pending_age) >= PENDING_EXPIRY_SECONDS) {
      pending = 0;
      await connection.query(
        `UPDATE guest_ai_usage SET pending_count = 0, pending_updated_at = NULL
         WHERE guest_key_hash = ? AND feature = ?`,
        [guestHash, feature]
      );
    }

    const used = Number(row.usage_count) || 0;
    if (used >= GUEST_AI_TRIAL_LIMIT) {
      throw new GuestAiUsageError(
        "Bạn đã sử dụng hết lượt dùng thử. Đăng nhập để tiếp tục.",
        "GUEST_TRIAL_EXHAUSTED",
        429
      );
    }
    if (pending >= GUEST_AI_TRIAL_LIMIT - used) {
      throw new GuestAiUsageError(
        "Một yêu cầu AI khác đang được xử lý. Vui lòng chờ.",
        "GUEST_REQUEST_IN_PROGRESS",
        429
      );
    }
    if (row.last_request_at && Number(row.seconds_since_request) < REQUEST_COOLDOWN_SECONDS) {
      throw new GuestAiUsageError(
        "Vui lòng chờ một chút trước khi gửi yêu cầu tiếp theo.",
        "GUEST_REQUEST_COOLDOWN",
        429
      );
    }

    await connection.query(
      `UPDATE guest_ai_usage
       SET pending_count = pending_count + 1, pending_updated_at = NOW(), last_request_at = NOW()
       WHERE guest_key_hash = ? AND feature = ?`,
      [guestHash, feature]
    );
    await connection.commit();
    return { guestHash, feature };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function finishRequest(reservation, successful) {
  if (!reservation?.guestHash || !VALID_FEATURES.has(reservation.feature)) return null;
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT usage_count, pending_count FROM guest_ai_usage
       WHERE guest_key_hash = ? AND feature = ? FOR UPDATE`,
      [reservation.guestHash, reservation.feature]
    );
    if (!rows[0]) {
      await connection.rollback();
      return quotaFromUsed(0);
    }
    const pending = Math.max(0, Number(rows[0].pending_count) || 0);
    const nextPending = Math.max(0, pending - 1);
    if (successful) {
      await connection.query(
        `UPDATE guest_ai_usage
         SET usage_count = LEAST(?, usage_count + 1), pending_count = ?,
             pending_updated_at = IF(? = 0, NULL, pending_updated_at), last_used_at = NOW()
         WHERE guest_key_hash = ? AND feature = ?`,
        [GUEST_AI_TRIAL_LIMIT, nextPending, nextPending, reservation.guestHash, reservation.feature]
      );
    } else {
      await connection.query(
        `UPDATE guest_ai_usage
         SET pending_count = ?, pending_updated_at = IF(? = 0, NULL, pending_updated_at)
         WHERE guest_key_hash = ? AND feature = ?`,
        [nextPending, nextPending, reservation.guestHash, reservation.feature]
      );
    }
    const [updatedRows] = await connection.query(
      "SELECT usage_count FROM guest_ai_usage WHERE guest_key_hash = ? AND feature = ?",
      [reservation.guestHash, reservation.feature]
    );
    await connection.commit();
    return quotaFromUsed(updatedRows[0]?.usage_count || 0);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  GuestAiUsageError,
  validateGuestId,
  validateFeature,
  getQuota,
  beginRequest,
  finishRequest,
};
