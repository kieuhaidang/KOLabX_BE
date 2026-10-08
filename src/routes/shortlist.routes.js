const express = require("express");
const shortlistController = require("../controllers/shortlist.controller");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/toggle", requireAuth, requireRole("marketer", "admin"), shortlistController.toggleShortlist);
router.get("/me", requireAuth, requireRole("marketer", "admin"), shortlistController.listShortlist);

module.exports = router;
