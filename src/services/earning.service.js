const { pool } = require("../config/db");

function mapEarningRow(row) {
  let withdrawalStatus = null;
  if (row.withdrawal_id) {
    if (row.withdrawal_status === "completed") {
      withdrawalStatus = "withdrawn";
    } else if (row.withdrawal_status === "pending") {
      withdrawalStatus = "pending_withdrawal";
    } else if (row.withdrawal_status === "rejected") {
      withdrawalStatus = "rejected";
    }
  } else {
    withdrawalStatus = "available";
  }

  return {
    id: row.id,
    bookingId: row.booking_id,
    kocId: row.koc_id,
    amount: Number(row.amount || 0),
    status: row.db_status || row.status,
    withdrawalStatus,
    campaignTitle: row.campaign_title || null,
    marketerName: row.marketer_name || null,
    paidAt: row.paid_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listEarningsByKocId(kocId) {
  const [rows] = await pool.query(
    `SELECT 
       e.id, 
       e.booking_id, 
       e.koc_id, 
       e.amount, 
       e.status AS db_status, 
       e.withdrawal_id,
       w.status AS withdrawal_status,
       c.title AS campaign_title,
       u.full_name AS marketer_name,
       e.paid_at, 
       e.created_at, 
       e.updated_at
     FROM earnings e
     INNER JOIN bookings b ON b.id = e.booking_id
     INNER JOIN campaigns c ON c.id = b.campaign_id
     INNER JOIN users u ON u.id = b.marketer_id
     LEFT JOIN withdrawals w ON w.id = e.withdrawal_id
     WHERE e.koc_id = ?
     ORDER BY e.created_at DESC`,
    [kocId]
  );
  return rows.map(mapEarningRow);
}

async function listAllEarnings() {
  const [rows] = await pool.query(
    `SELECT 
       e.id, 
       e.booking_id, 
       e.koc_id, 
       e.amount, 
       e.status AS db_status, 
       e.withdrawal_id,
       w.status AS withdrawal_status,
       c.title AS campaign_title,
       u.full_name AS marketer_name,
       e.paid_at, 
       e.created_at, 
       e.updated_at
     FROM earnings e
     INNER JOIN bookings b ON b.id = e.booking_id
     INNER JOIN campaigns c ON c.id = b.campaign_id
     INNER JOIN users u ON u.id = b.marketer_id
     LEFT JOIN withdrawals w ON w.id = e.withdrawal_id
     ORDER BY e.created_at DESC`
  );
  return rows.map(mapEarningRow);
}

async function getEarningByBookingId(bookingId) {
  const [rows] = await pool.query(
    `SELECT id, booking_id, koc_id, amount, status, paid_at, created_at, updated_at
     FROM earnings
     WHERE booking_id = ?
     LIMIT 1`,
    [bookingId]
  );
  return rows[0] ? mapEarningRow(rows[0]) : null;
}

async function createEarningForBooking(booking) {
  const existing = await getEarningByBookingId(booking.id);
  if (existing) return existing;

  const amount = Number(booking.offeredPrice || 0);
  const [result] = await pool.query(
    `INSERT INTO earnings (booking_id, koc_id, amount, status)
     VALUES (?, ?, ?, 'pending')`,
    [booking.id, booking.kocId, amount]
  );

  const [rows] = await pool.query(
    `SELECT id, booking_id, koc_id, amount, status, paid_at, created_at, updated_at
     FROM earnings WHERE id = ? LIMIT 1`,
    [result.insertId]
  );
  return rows[0] ? mapEarningRow(rows[0]) : null;
}

module.exports = {
  listEarningsByKocId,
  listAllEarnings,
  getEarningByBookingId,
  createEarningForBooking,
};
