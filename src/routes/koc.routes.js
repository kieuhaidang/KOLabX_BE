const express = require("express");
const { requireAuth } = require("../middleware/auth.middleware");
const kocController = require("../controllers/koc.controller");

const router = express.Router();

router.get("/subscription", requireAuth, kocController.getSubscription);
router.post("/subscription/upgrade-plus", requireAuth, kocController.upgradePlus);

module.exports = router;

