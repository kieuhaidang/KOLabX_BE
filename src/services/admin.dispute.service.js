const { pool } = require("../config/db");
const { DISPUTE_STATUS_SET } = require("../constants/disputes");

const DISPUTE_SELECT = `
  SELECT
    d.id,
    d.booking_id,
    c.title AS campaign_title,
    reporter.full_name AS reporter_name,
    reporter.role AS reporter_role,
    CASE
      WHEN reporter.id IS NOT NULL AND reporter.id = b.marketer_id THEN koc_user.full_name
      WHEN reporter.id IS NOT NULL AND reporter.id = b.koc_id THEN marketer_user.full_name
      ELSE COALESCE(koc_user.full_name, marketer_user.full_name)
    END AS respondent_name,
    d.reason,
    d.evidence,
    d.status,
    d.resolution_note,
    d.created_at,
    d.updated_at
  FROM disputes d
  LEFT JOIN bookings b ON b.id = d.booking_id
  LEFT JOIN campaigns c ON c.id = b.campaign_id
  LEFT JOIN users reporter ON reporter.id = d.reporter_id
  LEFT JOIN users marketer_user ON marketer_user.id = b.marketer_id
  LEFT JOIN users koc_user ON koc_user.id = b.koc_id
`;

function mapDisputeRow(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    campaignTitle: row.campaign_title ?? "",
    reporterName: row.reporter_name ?? "",
    reporterRole: row.reporter_role ?? "",
    respondentName: row.respondent_name ?? "",
    reason: row.reason,
    evidence: row.evidence,
    status: row.status,
    resolutionNote: row.resolution_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listDisputes(filters = {}) {
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.status) {
    conditions.push("d.status = ?");
    params.push(filters.status);
  }

  if (filters.search) {
    conditions.push(
      "(COALESCE(c.title, '') LIKE ? OR COALESCE(reporter.full_name, '') LIKE ? OR COALESCE(marketer_user.full_name, '') LIKE ? OR COALESCE(koc_user.full_name, '') LIKE ? OR COALESCE(d.reason, '') LIKE ?)"
    );
    const keyword = `%${filters.search}%`;
    params.push(keyword, keyword, keyword, keyword, keyword);
  }

  const [rows] = await pool.query(
    `${DISPUTE_SELECT}
     WHERE ${conditions.join(" AND ")}
     ORDER BY d.created_at DESC`,
    params
  );

  // Temporary debug — remove after verifying dispute list in production
  console.log("[admin.disputes] listDisputes row count:", rows.length);

  return rows.map(mapDisputeRow);
}

async function getDisputeById(disputeId) {
  const [rows] = await pool.query(`${DISPUTE_SELECT} WHERE d.id = ? LIMIT 1`, [disputeId]);

  console.log("[admin.disputes] getDisputeById id:", disputeId, "found:", rows.length > 0);

  return rows[0] ? mapDisputeRow(rows[0]) : null;
}

async function updateDisputeStatus(disputeId, status, resolutionNote) {
  if (!DISPUTE_STATUS_SET.has(status)) {
    const error = new Error("Invalid dispute status");
    error.status = 400;
    throw error;
  }

  const [result] = await pool.query(
    `UPDATE disputes
     SET status = ?, resolution_note = ?
     WHERE id = ?`,
    [status, resolutionNote ?? null, disputeId]
  );

  if (result.affectedRows === 0) {
    return null;
  }

  return getDisputeById(disputeId);
}

module.exports = {
  listDisputes,
  getDisputeById,
  updateDisputeStatus,
};
