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

// Một số MySQL cloud (vd. Aiven) bật sẵn chế độ ANSI (ANSI_QUOTES, PIPES_AS_CONCAT...),
// làm các câu SQL viết cho MySQL mặc định chạy sai. Ép mỗi kết nối về sql_mode mặc định của MySQL 8.
const DEFAULT_SQL_MODE =
  "ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION";
pool.pool.on("connection", (connection) => {
  connection.query(`SET SESSION sql_mode = '${DEFAULT_SQL_MODE}'`);
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
