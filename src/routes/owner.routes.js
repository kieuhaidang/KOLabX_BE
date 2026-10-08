const express = require("express");
const ownerController = require("../controllers/owner.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { allowRoles, requireActiveAccount, requirePermission } = require("../middleware/role.middleware");
const { adminOwnerLimiter } = require("../middleware/rateLimit.middleware");
const { PERMISSIONS } = require("../constants/permissions");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(adminOwnerLimiter, requireAuth, requireActiveAccount(), allowRoles(ROLES.OWNER));

router.get(
  "/dashboard",
  requirePermission(PERMISSIONS.OWNER_DASHBOARD_VIEW),
  ownerController.getDashboard
);
router.get(
  "/admins",
  requirePermission(PERMISSIONS.OWNER_ADMINS_VIEW),
  ownerController.listAdmins
);
router.get(
  "/admins/:id",
  requirePermission(PERMISSIONS.OWNER_ADMINS_VIEW),
  ownerController.getAdminById
);
router.put(
  "/admins/:id/status",
  requirePermission(PERMISSIONS.OWNER_ADMINS_MANAGE),
  ownerController.updateAdminStatus
);
router.put(
  "/admins/:id/role",
  requirePermission(PERMISSIONS.OWNER_ADMINS_MANAGE),
  ownerController.updateAdminRole
);
router.get(
  "/financial-settings",
  requirePermission(PERMISSIONS.OWNER_FINANCIAL_VIEW),
  ownerController.getFinancialSettings
);
router.put(
  "/financial-settings",
  requirePermission(PERMISSIONS.OWNER_FINANCIAL_MANAGE),
  ownerController.updateFinancialSettings
);
router.get(
  "/audit-logs",
  requirePermission(PERMISSIONS.OWNER_AUDIT_VIEW),
  ownerController.listAuditLogs
);

module.exports = router;
