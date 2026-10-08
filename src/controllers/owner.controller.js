const ownerService = require("../services/owner.service");
const { createAuditLog } = require("../services/audit.service");
const { ALL_USER_STATUSES, OWNER_ADMIN_ASSIGNABLE_ROLES } = require("../constants/roles");

const ALLOWED_USER_STATUSES = new Set(ALL_USER_STATUSES);
const ALLOWED_ADMIN_ROLES = new Set(OWNER_ADMIN_ASSIGNABLE_ROLES);

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
    const data = await ownerService.getOwnerDashboard();
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function listAdmins(req, res, next) {
  try {
    const status = req.query.status?.trim();
    if (status && !ALLOWED_USER_STATUSES.has(status)) {
      return res.status(400).json({ message: "Invalid status filter" });
    }

    const data = await ownerService.listAdmins(
      {
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

async function getAdminById(req, res, next) {
  try {
    const { userId, error } = parseUserIdParam(req);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const user = await ownerService.getAdminById(userId);
    if (!user) {
      return res.status(404).json({ message: "Admin not found" });
    }

    return res.status(200).json({ user });
  } catch (error) {
    return next(error);
  }
}

async function updateAdminStatus(req, res, next) {
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

    const user = await ownerService.updateAdminStatus(userId, status);
    if (!user) {
      return res.status(404).json({ message: "Admin not found" });
    }

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "owner.admin.status.update",
      targetType: "user",
      targetId: userId,
      description: `Admin status -> ${status}`,
    });

    return res.status(200).json({
      message: "Cap nhat trang thai admin thanh cong",
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function updateAdminRole(req, res, next) {
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
    if (!role || typeof role !== "string" || !ALLOWED_ADMIN_ROLES.has(role.trim())) {
      return res.status(400).json({ message: "Invalid role" });
    }

    const user = await ownerService.updateAdminRole(userId, role.trim());
    if (!user) {
      return res.status(404).json({ message: "Admin not found" });
    }

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "owner.admin.role.update",
      targetType: "user",
      targetId: userId,
      description: `Admin role -> ${role.trim()}`,
    });

    return res.status(200).json({
      message: "Cap nhat vai tro admin thanh cong",
      user,
    });
  } catch (error) {
    return next(error);
  }
}

async function getFinancialSettings(req, res, next) {
  try {
    const settings = await ownerService.getFinancialSettings();
    if (!settings) {
      return res.status(404).json({ message: "Platform settings not found" });
    }
    return res.status(200).json({ settings });
  } catch (error) {
    return next(error);
  }
}

async function updateFinancialSettings(req, res, next) {
  try {
    const body = req.body || {};
    const settings = await ownerService.updateFinancialSettings(
      {
        platformFeePercent: body.platformFeePercent,
        kocPayoutPercent: body.kocPayoutPercent,
        payoutDelayDays: body.payoutDelayDays,
        autoReleaseEnabled: body.autoReleaseEnabled,
      },
      req.user.id
    );

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "owner.financial.settings.update",
      targetType: "platform_settings",
      targetId: settings?.id ?? 1,
      description: `Fee ${settings?.platformFeePercent}% / KOC payout ${settings?.kocPayoutPercent}%`,
    });

    return res.status(200).json({
      message: "Cap nhat cai dat tai chinh thanh cong",
      settings,
    });
  } catch (error) {
    return next(error);
  }
}

async function listAuditLogs(req, res, next) {
  try {
    const actorId = req.query.actorId ? parsePositiveInt(req.query.actorId) : undefined;
    if (req.query.actorId && !actorId) {
      return res.status(400).json({ message: "Invalid actorId filter" });
    }

    const data = await ownerService.listAuditLogs(
      {
        action: req.query.action?.trim(),
        targetType: req.query.targetType?.trim(),
        actorId,
        search: req.query.search?.trim(),
      },
      parsePaginationQuery(req.query)
    );

    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getDashboard,
  listAdmins,
  getAdminById,
  updateAdminStatus,
  updateAdminRole,
  getFinancialSettings,
  updateFinancialSettings,
  listAuditLogs,
};
