const payosModule = require("@payos/node");

// Inject dummy values if env vars are missing so the server doesn't crash on startup
process.env.PAYOS_CLIENT_ID = process.env.PAYOS_CLIENT_ID || "dummy_client_id";
process.env.PAYOS_API_KEY = process.env.PAYOS_API_KEY || "dummy_api_key";
process.env.PAYOS_CHECKSUM_KEY = process.env.PAYOS_CHECKSUM_KEY || "dummy_checksum_key";

const PayOSClass = payosModule.PayOS || payosModule;

const payos = new PayOSClass(
  process.env.PAYOS_CLIENT_ID,
  process.env.PAYOS_API_KEY,
  process.env.PAYOS_CHECKSUM_KEY
);

module.exports = payos;
