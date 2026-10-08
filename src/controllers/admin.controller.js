const adminService = require("../services/admin.service");
const { createAuditLog } = require("../services/audit.service");
const { ALL_USER_STATUSES, ROLES } = require("../constants/roles");

const ALLOWED_USER_STATUSES = new Set(ALL_USER_STATUSES);
const ALLOWED_FILTER_ROLES = new Set([ROLES.MARKETER, ROLES.KOC]);
const ALLOWED_CAMPAIGN_STATUSES = new Set([
  "draft",
  "open",
  "in_progress",
  "completed",
  "cancelled",
]);

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function parsePaginationQuery(query) {
  return {
    page: query.page,
    limit: query.limit,
  };
}

function parseUserIdParam(req) {
  const userId = parsePositiveInt(req.params.id);
  if (!userId) {
    return { error: "Invalid user id" };
  }
  return { userId };
}

function preventSelfTarget(req, targetUserId, actionLabel) {
  if (req.user?.id === targetUserId) {
    return `Cannot ${actionLabel} your own account`;
  }
  return null;
}

async function getDashboard(req, res, next) {
  try {
    const data = await adminService.getAdminDashboardBundle();
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listUsers(req, res, next) {
  try {
    const role = req.query.role?.trim();
    const status = req.query.status?.trim();

    if (role && !ALLOWED_FILTER_ROLES.has(role)) {
      return res.status(400).json({ message: "Invalid role filter" });
    }

    if (status && !ALLOWED_USER_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid status filter" });
    }

    const data = await adminService.listUsers(
      {
        role,
        status,
        search: req.query.search?.trim(),
      },
      parsePaginationQuery(req.query)
    );

    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function getUserById(req, res, next) {
  try {
    const { userId, error } = parseUserIdParam(req);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const user = await adminService.getUserById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
}

async function updateUserStatus(req, res, next) {
  try {
    const { userId, error } = parseUserIdParam(req);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const selfError = preventSelfTarget(req, userId, "change status of");
    if (selfError) {
      return res.status(403).json({ message: selfError });
    }

    const { status } = req.body || {};
    if (!ALLOWED_USER_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid user status" });
    }

    const user = await adminService.updateUserStatus(userId, status);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "admin.user.status.update",
      targetType: "user",
      targetId: userId,
      description: `Status -> ${status}`,
    });

    return res.status(200).json({
      message: "Cập nhật trạng thái người dùng thành công",
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateUserRole(req, res, next) {
  try {
    const { userId, error } = parseUserIdParam(req);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const selfError = preventSelfTarget(req, userId, "change role of");
    if (selfError) {
      return res.status(403).json({ message: selfError });
    }

    const { role } = req.body || {};
    if (!role || typeof role !== "string") {
      return res.status(400).json({ message: "role is required" });
    }

    const user = await adminService.updateUserRole(userId, role.trim());
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "admin.user.role.update",
      targetType: "user",
      targetId: userId,
      description: `Role -> ${role.trim()}`,
    });

    return res.status(200).json({
      message: "Cập nhật vai trò người dùng thành công",
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function banUser(req, res, next) {
  try {
    const { userId, error } = parseUserIdParam(req);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const selfError = preventSelfTarget(req, userId, "ban");
    if (selfError) {
      return res.status(403).json({ message: selfError });
    }

    const user = await adminService.banUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "admin.user.ban",
      targetType: "user",
      targetId: userId,
      description: "User banned",
    });

    return res.status(200).json({
      message: "Đã khóa tài khoản người dùng",
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function unbanUser(req, res, next) {
  try {
    const { userId, error } = parseUserIdParam(req);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const user = await adminService.unbanUser(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json({
      message: "Đã mở khóa tài khoản người dùng",
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function listCampaigns(req, res, next) {
  try {
    const status = req.query.status?.trim();
    if (status && !ALLOWED_CAMPAIGN_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid campaign status filter" });
    }

    const marketerId = req.query.marketerId ? parsePositiveInt(req.query.marketerId) : undefined;
    if (req.query.marketerId && !marketerId) {
      return res.status(400).json({ message: "Invalid marketerId filter" });
    }

    const data = await adminService.listCampaigns(
      {
        status,
        marketerId,
        search: req.query.search?.trim(),
      },
      parsePaginationQuery(req.query)
    );

    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function getReports(req, res, next) {
  try {
    const data = await adminService.getReportsOverview();
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listEarnings(req, res, next) {
  try {
    const [items, summary] = await Promise.all([
      adminService.listDetailedEarnings(),
      adminService.getAdminEarningsSummary(),
    ]);
    return res.status(200).json({ items, summary });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboard,
  listUsers,
  getUserById,
  updateUserStatus,
  updateUserRole,
  banUser,
  unbanUser,
  listCampaigns,
  getReports,
  listEarnings,
};
