const mysql = require("mysql2/promise");

const isProduction = process.env.NODE_ENV === "production";
const useSsl = process.env.DB_SSL ? process.env.DB_SSL !== "false" : isProduction;
const sslCa = process.env.DB_SSL_CA ? process.env.DB_SSL_CA.replace(/\\n/g, "\n") : undefined;

const connectionConfig = {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

if (useSsl) {
  connectionConfig.ssl = sslCa
    ? { ca: sslCa, rejectUnauthorized: true }
    : { rejectUnauthorized: false };
}

const pool = mysql.createPool({
  ...connectionConfig,
});

async function checkDbConnection() {
  if (isProduction && (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD || !process.env.DB_NAME)) {
    throw new Error("Missing required database environment variables");
  }

  const connection = await pool.getConnection();
  try {
    await connection.query("SELECT 1");
    console.log("Database connected successfully");
  } finally {
    connection.release();
  }
}

module.exports = {
  pool,
  checkDbConnection,
};
