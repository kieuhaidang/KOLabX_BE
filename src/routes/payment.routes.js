const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");

// Link thanh toán cần đăng nhập
router.post("/create-link", requireAuth, paymentController.createLink);

// Webhook từ PayOS (Không cần authenticate nhưng cần verify checksum trong controller)
router.post("/webhook", paymentController.webhook);

// Kiểm tra và xác thực trạng thái thanh toán trực tiếp từ PayOS
router.get("/verify/:orderCode", requireAuth, paymentController.verifyPayment);
router.get("/campaigns/verify/:orderCode", requireAuth, requireRole("marketer", "admin"), paymentController.verifyCampaignPayment);

module.exports = router;
