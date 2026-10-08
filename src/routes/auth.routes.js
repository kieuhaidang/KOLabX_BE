const express = require("express");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/auth.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

const { authSensitiveLimiter } = require("../middleware/rateLimit.middleware");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau 15 phút." },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post("/register", authSensitiveLimiter, authController.register);
router.post("/login", authSensitiveLimiter, authController.login);
router.post("/logout", authController.logout);
router.get("/me", requireAuth, authController.me);
router.get("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authLimiter, authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);
router.post("/resend-verification", authLimiter, authController.resendVerification);

module.exports = router;
