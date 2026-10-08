const express = require("express");
const subscriptionController = require("../controllers/subscription.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { ROLES } = require("../constants/roles");

const router = express.Router();

// Public route để xem các gói
router.get("/plans", subscriptionController.listPlans);

// Routes yêu cầu đăng nhập Marketer
router.post("/checkout", requireAuth, allowRoles(ROLES.MARKETER), subscriptionController.createCheckout);
router.get("/me", requireAuth, allowRoles(ROLES.MARKETER), subscriptionController.getMySubscription);

module.exports = router;
