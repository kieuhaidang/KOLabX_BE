const express = require("express");
const messageController = require("../controllers/message.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/booking/:bookingId", requireAuth, messageController.listMessagesByBooking);
router.post("/booking/:bookingId", requireAuth, messageController.createMessage);
router.put("/booking/:bookingId/read", requireAuth, messageController.markAsRead);
router.put("/booking/:bookingId/hide", requireAuth, messageController.hideChat);
router.delete("/booking/:bookingId", requireAuth, messageController.deleteChat);

module.exports = router;
