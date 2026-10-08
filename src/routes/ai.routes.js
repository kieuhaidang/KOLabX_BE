const express = require("express");
const aiController = require("../controllers/ai.controller");
const guestAiController = require("../controllers/guestAi.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { allowRoles } = require("../middleware/role.middleware");
const { ROLES } = require("../constants/roles");
const { guestAiLimiter } = require("../middleware/rateLimit.middleware");

const router = express.Router();

router.get("/guest/quota", guestAiLimiter, guestAiController.getQuota);
router.post("/guest/auto-brief", guestAiLimiter, guestAiController.autoBrief);
router.post("/guest/script-doctor", guestAiLimiter, guestAiController.scriptDoctor);

router.post("/auto-brief", requireAuth, allowRoles(ROLES.MARKETER), aiController.autoBrief);
router.post("/script-doctor", requireAuth, allowRoles(ROLES.KOC), aiController.scriptDoctor);
router.get("/quota", requireAuth, allowRoles(ROLES.KOC), aiController.getQuota);
router.post("/upgrade-plus", requireAuth, allowRoles(ROLES.KOC), aiController.upgradePlus);
router.get("/smart-matching/:campaignId", requireAuth, allowRoles(ROLES.MARKETER), aiController.smartMatching);
router.post("/smart-matching", requireAuth, allowRoles(ROLES.MARKETER), aiController.smartMatching);
router.get("/briefs/me", requireAuth, allowRoles(ROLES.MARKETER), aiController.listMyBriefs);
router.get("/script-reviews/me", requireAuth, allowRoles(ROLES.KOC), aiController.listMyScriptReviews);
router.patch("/script-reviews/:id", requireAuth, allowRoles(ROLES.KOC), aiController.updateScriptReview);
router.post("/script-reviews/:id/revise", requireAuth, allowRoles(ROLES.KOC), aiController.reviseScriptReview);

module.exports = router;
