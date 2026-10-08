const { pool } = require("../config/db");

function mapMessageRow(row) {
  return {
    id: row.id,
    bookingId: row.booking_id,
    senderId: row.sender_id,
    content: row.content,
    isRead: Boolean(row.is_read),
    fileUrl: row.file_url,
    fileType: row.file_type,
    sentAt: row.sent_at,
  };
}

async function listMessagesByBooking(bookingId, userId) {
  // Get user role and deletion timestamp for this booking
  const [bRows] = await pool.query(
    "SELECT marketer_id, marketer_deleted_at, koc_id, koc_deleted_at FROM bookings WHERE id = ?",
    [bookingId]
  );
  
  if (bRows.length === 0) return [];
  const b = bRows[0];
  let deletedAt = null;
  if (b.marketer_id === userId) deletedAt = b.marketer_deleted_at;
  else if (b.koc_id === userId) deletedAt = b.koc_deleted_at;

  const conditions = ["booking_id = ?"];
  const params = [bookingId];

  if (deletedAt) {
    conditions.push("sent_at > ?");
    params.push(deletedAt);
  }

  const [rows] = await pool.query(
    `SELECT * FROM messages WHERE ${conditions.join(" AND ")} ORDER BY sent_at ASC`,
    params
  );
  return rows.map(mapMessageRow);
}

async function createMessage({ bookingId, senderId, content, fileUrl = null, fileType = null }) {
  const [result] = await pool.query(
    "INSERT INTO messages (booking_id, sender_id, content, file_url, file_type) VALUES (?, ?, ?, ?, ?)",
    [bookingId, senderId, content, fileUrl, fileType]
  );

  const [rows] = await pool.query(
    "SELECT * FROM messages WHERE id = ? LIMIT 1",
    [result.insertId]
  );

  return rows[0] ? mapMessageRow(rows[0]) : null;
}

async function markAsRead(bookingId, userId) {
  // Mark messages NOT sent by the current user as read
  await pool.query(
    "UPDATE messages SET is_read = 1 WHERE booking_id = ? AND sender_id != ? AND is_read = 0",
    [bookingId, userId]
  );
  return true;
}

module.exports = {
  listMessagesByBooking,
  createMessage,
  markAsRead,
};
