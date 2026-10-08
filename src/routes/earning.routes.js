const express = require("express");
const earningController = require("../controllers/earning.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/me", requireAuth, earningController.getMyEarnings);

module.exports = router;
