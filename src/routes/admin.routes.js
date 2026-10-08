const express = require("express");
const adminController = require("../controllers/admin.controller");
const adminDisputeController = require("../controllers/admin.dispute.controller");
const paymentController = require("../controllers/payment.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRoles, requireActiveAccount, requirePermission } = require("../middleware/role.middleware");
const { adminOwnerLimiter } = require("../middleware/rateLimit.middleware");
const { PERMISSIONS } = require("../constants/permissions");
const { ROLES } = require("../constants/roles");

const router = express.Router();

router.use(adminOwnerLimiter, requireAuth, requireActiveAccount(), requireRoles(ROLES.ADMIN, ROLES.OWNER));

router.get(
  "/dashboard",
  requirePermission(PERMISSIONS.ADMIN_DASHBOARD_VIEW),
  adminController.getDashboard
);
router.get(
  "/users",
  requirePermission(PERMISSIONS.ADMIN_USERS_VIEW),
  adminController.listUsers
);
router.get(
  "/users/:id",
  requirePermission(PERMISSIONS.ADMIN_USERS_VIEW),
  adminController.getUserById
);
router.put(
  "/users/:id/status",
  requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE),
  adminController.updateUserStatus
);
router.put(
  "/users/:id/role",
  requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE),
  adminController.updateUserRole
);
router.put(
  "/users/:id/ban",
  requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE),
  adminController.banUser
);
router.put(
  "/users/:id/unban",
  requirePermission(PERMISSIONS.ADMIN_USERS_MANAGE),
  adminController.unbanUser
);
router.get(
  "/campaigns",
  requirePermission(PERMISSIONS.ADMIN_CAMPAIGNS_VIEW),
  adminController.listCampaigns
);
router.get(
  "/reports",
  requirePermission(PERMISSIONS.ADMIN_REPORTS_VIEW),
  adminController.getReports
);
router.get(
  "/earnings",
  requirePermission(PERMISSIONS.ADMIN_EARNINGS_VIEW),
  adminController.listEarnings
);
router.get(
  "/payments",
  requirePermission(PERMISSIONS.ADMIN_PAYMENTS_VIEW),
  paymentController.adminListPayments
);
router.get(
  "/payments/:id",
  requirePermission(PERMISSIONS.ADMIN_PAYMENTS_VIEW),
  paymentController.adminGetPaymentById
);
router.patch(
  "/payments/:id/confirm",
  requirePermission(PERMISSIONS.ADMIN_PAYMENTS_MANAGE),
  paymentController.adminConfirmPayment
);
router.patch(
  "/payments/:id/reject",
  requirePermission(PERMISSIONS.ADMIN_PAYMENTS_MANAGE),
  paymentController.adminRejectPayment
);
router.get(
  "/disputes",
  requirePermission(PERMISSIONS.ADMIN_DISPUTES_VIEW),
  adminDisputeController.listDisputes
);
router.get(
  "/disputes/:id",
  requirePermission(PERMISSIONS.ADMIN_DISPUTES_VIEW),
  adminDisputeController.getDisputeById
);
router.patch(
  "/disputes/:id/status",
  requirePermission(PERMISSIONS.ADMIN_DISPUTES_MANAGE),
  adminDisputeController.updateDisputeStatus
);

module.exports = router;
