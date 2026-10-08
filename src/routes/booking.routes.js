const express = require("express");
const bookingController = require("../controllers/booking.controller");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { requireBookingOwner } = require("../middleware/ownership.middleware");

const router = express.Router();

router.post("/", requireAuth, bookingController.createBooking);
router.get("/marketer/submissions", requireAuth, bookingController.listMarketerSubmissions);
router.get("/", requireAuth, bookingController.listBookings);
router.get("/campaign/:campaignId", requireAuth, requireRole("marketer", "admin"), bookingController.listApplicantsByCampaign);
router.put("/:id/submission", requireAuth, bookingController.submitSubmission);
router.put("/:id/review-submission", requireAuth, bookingController.reviewSubmission);
router.get("/:id", requireAuth, bookingController.getBookingById);
router.put("/:id/content", requireAuth, requireRole("koc"), bookingController.updateContent);
router.put("/:id/status", requireAuth, requireRole("marketer", "koc", "admin"), requireBookingOwner, bookingController.updateBookingStatus);

module.exports = router;
