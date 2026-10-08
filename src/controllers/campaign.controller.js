const campaignService = require("../services/campaign.service");
const paymentService = require("../services/payment.service");
const { pool } = require("../config/db");
const { campaignCreateSchema, campaignUpdateSchema } = require("../utils/zodSchemas");
const { ZodError } = require("zod");

async function createCampaign(req, res, next) {
  try {
    console.log("createCampaign body:", req.body);
    const validatedData = campaignCreateSchema.parse(req.body);
    const campaign = await campaignService.createCampaign(
      req.user.id,
      validatedData
    );

    res.status(201).json({
      message: "Tạo chiến dịch thành công",
      campaign,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      console.error("Zod ValidationError details:", error.errors);
      return res.status(400).json({ message: "Dữ liệu không hợp lệ", errors: error.errors });
    }
    next(error);
  }
}

async function listCampaigns(req, res, next) {
  try {
    const filters = {
      status: req.query.status,
      platform: req.query.platform,
      category: req.query.category,
    };
    if (req.user.role === 'marketer') {
      filters.marketerId = req.user.id;
    }
    const items = await campaignService.listCampaigns(filters);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function getCampaignById(req, res, next) {
  try {
    const campaign = await campaignService.getCampaignById(req.params.id);
    if (!campaign) return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
    
    if (req.user.role === 'marketer' && campaign.marketerId !== req.user.id) {
      return res.status(403).json({ message: "Bạn không có quyền truy cập chiến dịch này" });
    }

    res.json({ campaign });
  } catch (error) {
    next(error);
  }
}

async function updateCampaign(req, res, next) {
  try {
    const validatedData = campaignUpdateSchema.parse(req.body);
    const campaignId = req.params.id;

    if (validatedData.status === 'cancelled') {
      await pool.query(
        "UPDATE bookings SET status = 'rejected' WHERE campaign_id = ? AND status = 'pending'",
        [campaignId]
      );
    }

    const campaign = await campaignService.updateCampaign(campaignId, validatedData);
    res.json({ message: "Cập nhật thành công", campaign });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({ message: "Dữ liệu cập nhật không hợp lệ", errors: error.errors });
    }
    next(error);
  }
}

async function deleteCampaign(req, res, next) {
  try {
    const success = await campaignService.deleteCampaign(req.params.id, req.user.id);
    if (!success) return res.status(404).json({ message: "Xóa thất bại" });
    res.json({ message: "Đã xóa chiến dịch" });
  } catch (error) {
    next(error);
  }
}

async function listAvailable(req, res, next) {
  try {
    const filters = {
      platform: req.query.platform,
      category: req.query.category,
    };
    const items = await campaignService.listAvailableCampaigns(req.user.id, filters);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function getMarketerStats(req, res, next) {
  try {
    const marketerId = req.user.id;
    
    const [spentRows] = await pool.query(
      "SELECT SUM(offered_price) as total FROM bookings WHERE marketer_id = ? AND status = 'completed'",
      [marketerId]
    );
    
    const [activeRows] = await pool.query(
      "SELECT COUNT(DISTINCT koc_id) as total FROM bookings WHERE marketer_id = ? AND status = 'accepted'",
      [marketerId]
    );

    const [trendRows] = await pool.query(
      `SELECT DATE(updated_at) as date, SUM(offered_price) as daily_total
       FROM bookings 
       WHERE marketer_id = ? AND status = 'completed' AND updated_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
       GROUP BY DATE(updated_at)
       ORDER BY date ASC`,
      [marketerId]
    );

    res.json({
      totalSpent: Number(spentRows[0].total || 0),
      activeKocs: Number(activeRows[0].total || 0),
      spendingTrend: trendRows.map(r => ({
        date: r.date,
        amount: Number(r.daily_total || 0)
      }))
    });
  } catch (error) {
    next(error);
  }
}

async function payCampaign(req, res, next) {
  try {
    const campaignId = req.params.id;
    const campaign = req.campaign || await campaignService.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
    }

    if (campaign.status !== 'pending_payment') {
      return res.status(400).json({ message: "Chiến dịch không ở trạng thái chờ thanh toán" });
    }

    const paymentLinkRes = await paymentService.getOrCreateCampaignPaymentLink(req.user.id, campaign.id);

    res.status(200).json({
      message: "Tao link thanh toan thanh cong",
      ...paymentLinkRes,
    });
  } catch (error) {
    next(error);
  }
}

async function topupCampaign(req, res, next) {
  try {
    const campaignId = req.params.id;
    const { amount } = req.body;
    const topupAmount = Number(amount);

    if (isNaN(topupAmount) || topupAmount < 10000) {
      return res.status(400).json({ message: "Số tiền nạp tối thiểu là 10,000 VND" });
    }

    const campaign = req.campaign || await campaignService.getCampaignById(campaignId);
    if (!campaign) {
      return res.status(404).json({ message: "Không tìm thấy chiến dịch" });
    }

    const invalidStatuses = ['draft', 'cancelled', 'completed', 'pending_payment'];
    if (invalidStatuses.includes(campaign.status)) {
      return res.status(400).json({ message: `Không thể nạp tiền cho chiến dịch ở trạng thái ${campaign.status}` });
    }

    // Generate PayOS payment link for campaign budget topup
    const paymentLinkRes = await paymentService.createPaymentLink(
      req.user.id,
      topupAmount,
      `Topup campaign #${campaign.id}`,
      null, // bookingId is null
      campaign.id // campaignId
    );

    res.status(200).json({
      message: "Tạo link nạp tiền thành công",
      checkoutUrl: paymentLinkRes.checkoutUrl,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createCampaign,
  listCampaigns,
  getCampaignById,
  updateCampaign,
  deleteCampaign,
  listAvailable,
  getMarketerStats,
  payCampaign,
  topupCampaign,
};
