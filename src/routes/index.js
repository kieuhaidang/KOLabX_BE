const express = require("express");
const { apiLimiter } = require("../middleware/rateLimit.middleware");
const authRoutes = require("./auth.routes");
const profileRoutes = require("./profile.routes");
const campaignRoutes = require("./campaign.routes");
const bookingRoutes = require("./booking.routes");
const messageRoutes = require("./message.routes");
const earningRoutes = require("./earning.routes");
const kocRoutes = require("./koc.routes");
const aiRoutes = require("./ai.routes");
const adminRoutes = require("./admin.routes");
const ownerRoutes = require("./owner.routes");
const shortlistRoutes = require("./shortlist.routes");
const uploadRoutes = require("./upload.routes");
const paymentRoutes = require("./payment.routes");
const withdrawalRoutes = require("./withdrawal.routes");
const subscriptionRoutes = require("./subscription.routes");
const walletRoutes = require("./wallet.routes");

const router = express.Router();

router.get("/health", (req, res) => {
  return res.status(200).json({
    message: "OK",
    timestamp: new Date().toISOString(),
  });
});

router.use(apiLimiter);

router.use("/auth", authRoutes);
router.use("/profiles", profileRoutes);
router.use("/campaigns", campaignRoutes);
router.use("/bookings", bookingRoutes);
router.use("/messages", messageRoutes);
router.use("/earnings", earningRoutes);
router.use("/koc", kocRoutes);
router.use("/ai", aiRoutes);
router.use("/admin", adminRoutes);
router.use("/owner", ownerRoutes);
router.use("/shortlist", shortlistRoutes);
router.use("/upload", uploadRoutes);
router.use("/payments", paymentRoutes);
router.use("/withdrawals", withdrawalRoutes);
router.use("/subscriptions", subscriptionRoutes);
router.use("/wallets", walletRoutes);

module.exports = router;
