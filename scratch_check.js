const mysql = require("mysql2/promise");
require("dotenv").config();

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 3306,
    database: process.env.DB_NAME || "kolab_db",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "sa123",
  });

  try {
    const [result] = await connection.query(
      `ALTER TABLE bookings MODIFY COLUMN status ENUM('pending', 'accepted', 'rejected', 'cancelled', 'completed', 'draft_submitted', 'revision_requested', 'final_submitted', 'in_progress') DEFAULT 'pending'`
    );
    console.log("=== BOOKINGS STATUS ENUM UPDATED ===");
    console.log(result);
  } catch (err) {
    console.error(err);
  } finally {
    await connection.end();
  }
}

main();
