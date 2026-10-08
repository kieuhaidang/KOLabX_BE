const express = require("express");
const profileController = require("../controllers/profile.controller");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.get("/me", requireAuth, profileController.getMe);
router.put("/me", requireAuth, profileController.updateMe);
router.put("/password", requireAuth, profileController.updatePassword);
router.get("/kocs", profileController.listKocs);
router.get("/kocs/:id", profileController.getKocById);

module.exports = router;

