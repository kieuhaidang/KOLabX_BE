const bookingService = require("../services/booking.service");
const campaignService = require("../services/campaign.service");

/**
 * Middleware to check if the current user is the owner of a campaign.
 */
async function requireCampaignOwner(req, res, next) {
  try {
    const campaignId = req.params.campaignId || req.params.id || req.body.campaignId;
    if (!campaignId) return res.status(400).json({ message: "Missing campaignId" });

    const campaign = await campaignService.getCampaignById(campaignId);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    if (campaign.marketerId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: "Bạn không có quyền quản lý chiến dịch này" });
    }

    req.campaign = campaign; // Attach campaign to request for later use
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Middleware to check if the current user is the owner (marketer) of a booking.
 */
async function requireBookingOwner(req, res, next) {
  try {
    const bookingId = req.params.id || req.body.bookingId;
    if (!bookingId) return res.status(400).json({ message: "Missing bookingId" });

    const booking = await bookingService.getBookingById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Check if user is either the marketer or the KOC for this booking
    const isMarketerOwner = booking.marketerId === req.user.id;
    const isKocOwner = booking.kocId === req.user.id;

    if (!isMarketerOwner && !isKocOwner && req.user.role !== 'admin') {
      return res.status(403).json({ message: "You do not have permission to manage this booking" });
    }

    req.booking = booking; // Attach booking to request
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  requireCampaignOwner,
  requireBookingOwner
};
