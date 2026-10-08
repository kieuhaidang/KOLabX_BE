const { pool } = require("../config/db");

async function toggleShortlist(marketerId, kocId) {
  // Check if exists
  const [existing] = await pool.query(
    "SELECT id FROM shortlists WHERE marketer_id = ? AND koc_id = ?",
    [marketerId, kocId]
  );

  if (existing.length > 0) {
    // Remove
    await pool.query("DELETE FROM shortlists WHERE marketer_id = ? AND koc_id = ?", [marketerId, kocId]);
    return { status: 'removed' };
  } else {
    // Add
    await pool.query("INSERT INTO shortlists (marketer_id, koc_id) VALUES (?, ?)", [marketerId, kocId]);
    return { status: 'added' };
  }
}

async function listShortlist(marketerId) {
  // Use a simpler query that focusing on the IDs first, to ensure we don't lose any due to profile missing
  const [rows] = await pool.query(
    `SELECT s.koc_id, u.full_name, kp.display_name
     FROM shortlists s
     JOIN users u ON s.koc_id = u.id
     LEFT JOIN koc_profiles kp ON u.id = kp.user_id
     WHERE s.marketer_id = ?
     ORDER BY s.created_at DESC`,
    [marketerId]
  );
  
  // Return consistent structure
  return rows.map(r => ({
    koc_id: r.koc_id,
    user_id: r.koc_id, // duplicate for compatibility
    fullName: r.full_name,
    displayName: r.display_name
  }));
}

module.exports = {
  toggleShortlist,
  listShortlist
};
