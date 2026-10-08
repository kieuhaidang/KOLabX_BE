const express = require("express");
const router = express.Router();
const withdrawalController = require("../controllers/withdrawal.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRoles } = require("../middleware/role.middleware");
const { ROLES } = require("../constants/roles");

// --- KOC Routes ---
router.post("/request", requireAuth, requireRoles(ROLES.KOC), withdrawalController.requestWithdrawal);
router.get("/me", requireAuth, requireRoles(ROLES.KOC), withdrawalController.getMyWithdrawals);

// --- Admin/Owner Routes ---
router.get("/admin/list", requireAuth, requireRoles(ROLES.ADMIN, ROLES.OWNER), withdrawalController.adminListWithdrawals);
router.put("/admin/:id/status", requireAuth, requireRoles(ROLES.ADMIN, ROLES.OWNER), withdrawalController.adminUpdateStatus);

module.exports = router;
