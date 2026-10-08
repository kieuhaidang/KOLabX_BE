const express = require("express");
const campaignController = require("../controllers/campaign.controller");
const { requireAuth, requireRole } = require("../middleware/auth.middleware");
const { requireCampaignOwner } = require("../middleware/ownership.middleware");

const router = express.Router();

router.post("/", requireAuth, requireRole("marketer", "admin"), campaignController.createCampaign);
router.get("/", requireAuth, campaignController.listCampaigns);
router.get("/available", requireAuth, requireRole("koc"), campaignController.listAvailable);
router.get("/stats", requireAuth, requireRole("marketer"), campaignController.getMarketerStats);
router.get("/:id", requireAuth, campaignController.getCampaignById);
router.post("/:id/pay", requireAuth, requireRole("marketer", "admin"), requireCampaignOwner, campaignController.payCampaign);
router.post("/:id/topup", requireAuth, requireRole("marketer", "admin"), requireCampaignOwner, campaignController.topupCampaign);
router.put("/:id", requireAuth, requireRole("marketer", "admin"), requireCampaignOwner, campaignController.updateCampaign);
router.delete("/:id", requireAuth, requireRole("marketer", "admin"), requireCampaignOwner, campaignController.deleteCampaign);

module.exports = router;
