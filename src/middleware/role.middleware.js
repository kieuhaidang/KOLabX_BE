const { pool } = require("../config/db");
const { ROLES, USER_STATUSES, isAdminOrOwner } = require("../constants/roles");
const { roleHasPermission } = require("../constants/permissions");

function requireRoles(...roles) {
  const allowed = new Set(roles);

  return (req, res, next) => {
    if (!req.user?.role || !allowed.has(req.user.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

const allowRoles = requireRoles;

function requireAdminOrOwner() {
  return (req, res, next) => {
    if (!isAdminOrOwner(req.user?.role)) {
      return res.status(403).json({ message: "Forbidden" });
    }
    return next();
  };
}

function requirePermission(...permissions) {
  const required = permissions;

  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const hasAll = required.every((permission) => roleHasPermission(role, permission));
    if (!hasAll) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };
}

function requireAnyPermission(...permissions) {
  const required = permissions;

  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) {
      return res.status(403).json({ message: "Forbidden" });
    }

    const hasAny = required.some((permission) => roleHasPermission(role, permission));
    if (!hasAny) {
      return res.status(403).json({ message: "Forbidden" });
    }

    return next();
  };
}

/**
 * Rejects banned or inactive accounts using current DB state (not JWT claims).
 */
function requireActiveAccount() {
  return async (req, res, next) => {
    try {
      if (!req.user?.id) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (isAdminOrOwner(req.user.role)) {
        return next();
      }

      const [rows] = await pool.query("SELECT status FROM users WHERE id = ? LIMIT 1", [req.user.id]);
      const status = rows[0]?.status;

      if (!status) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      if (status === USER_STATUSES.BANNED) {
        return res.status(403).json({ message: "Tài khoản đã bị khóa" });
      }

      if (status === USER_STATUSES.INACTIVE) {
        return res.status(403).json({ message: "Tài khoản đang tạm ngưng" });
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

module.exports = {
  requireRoles,
  allowRoles,
  requireAdminOrOwner,
  requirePermission,
  requireAnyPermission,
  requireActiveAccount,
};

