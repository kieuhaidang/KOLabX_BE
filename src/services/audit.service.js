const { pool } = require("../config/db");

function createAuditLog(payload) {
  const {
    actorId = null,
    actorRole,
    action,
    targetType,
    targetId = null,
    description = null,
  } = payload;

  if (!actorRole || !action || !targetType) {
    return;
  }

  setImmediate(() => {
    pool
      .query(
        "INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, description) VALUES (?, ?, ?, ?, ?, ?)",
        [actorId, actorRole, action, targetType, targetId, description]
      )
      .catch((error) => {
        console.error("createAuditLog failed:", error.message);
      });
  });
}

module.exports = {
  createAuditLog,
};

