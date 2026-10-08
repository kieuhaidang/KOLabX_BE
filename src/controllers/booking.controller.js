const bookingService = require("../services/booking.service");
const authService = require("../services/auth.service");
const mailService = require("../services/mail.service");
const { pool } = require("../config/db");
const { bookingCreateSchema, bookingReviewSchema, contentSubmissionSchema } = require("../utils/zodSchemas");

async function createBooking(req, res, next) {
  try {
    const validatedData = bookingCreateSchema.parse(req.body);

    const payload = {
      campaignId: validatedData.campaignId,
      kocId: req.user.role === "koc" ? req.user.id : validatedData.kocId || null,
      marketerId: req.user.role === "marketer" ? req.user.id : req.body.marketerId || null,
      direction: validatedData.direction,
      offeredPrice: validatedData.offeredPrice ?? 0,
      note: validatedData.note,
      estimatedDeliveryDays: validatedData.estimatedDeliveryDays ?? 7,
      sampleLink: validatedData.sampleLink,
    };

    const campaign = await bookingService.getCampaignById(payload.campaignId);
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });
    if (campaign.status !== "open" && campaign.status !== "scheduled") {
      return res.status(400).json({ message: "Chien dich chua thanh toan hoac khong san sang nhan booking" });
    }

    if (req.user.role === "koc") {
      payload.marketerId = campaign.marketer_id;
    }

    if ((req.user.role === "marketer" || req.user.role === "admin") && !payload.kocId) {
      return res.status(400).json({ message: "Vui long chon KOC de moi" });
    }

    if (!payload.marketerId) {
      return res.status(400).json({ message: "Khong xac dinh duoc marketer cua booking" });
    }

    const [existing] = await pool.query(
      "SELECT id FROM bookings WHERE campaign_id = ? AND koc_id = ? AND status != 'cancelled' LIMIT 1",
      [payload.campaignId, payload.kocId]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        message: "KOC nay da co trong danh sach chien dich nay roi.",
        bookingId: existing[0].id,
      });
    }

    const booking = await bookingService.createBooking(payload);

    // Gửi email thông báo bất đồng bộ nếu là Marketer mời KOC (outbound / marketer_invited)
    if (payload.direction === "outbound" || payload.direction === "marketer_invited") {
      // Chạy ngầm không dùng await để tránh block luồng trả về
      (async () => {
        try {
          // Lấy thông tin KOC
          const koc = await authService.getCurrentUser(payload.kocId);
          // Lấy thông tin Campaign và Marketer thông qua booking detail
          const detailedBooking = await bookingService.getBookingById(booking.id);
          
          if (koc && koc.email && detailedBooking) {
            await mailService.sendBookingInvitationEmail(
              koc.email,
              koc.fullName || "KOC",
              detailedBooking.campaignTitle || "Chiến dịch mới",
              detailedBooking.marketerName || "Một nhãn hàng",
              detailedBooking.campaign?.description || "" // Truyền thêm mô tả
            );
          }
        } catch (mailError) {
          console.error("Failed to send booking invitation email:", mailError);
        }
      })();
    }

    res.status(201).json({ message: "Gui yeu cau thanh cong", booking });
  } catch (error) {
    next(error);
  }
}

async function listBookings(req, res, next) {
  try {
    const filters = {
      status: req.query.status,
      search: req.query.search,
      onlyVisible: req.query.onlyVisible === "true",
    };
    const items = await bookingService.listBookingsForUser(req.user, filters);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function listMarketerSubmissions(req, res, next) {
  try {
    if (req.user.role !== "marketer") {
      return res.status(403).json({ message: "Chi Marketer moi xem duoc bai nop." });
    }
    const items = await bookingService.listMarketerSubmissions(req.user.id);
    return res.json({ items });
  } catch (error) {
    next(error);
  }
}

async function listApplicantsByCampaign(req, res, next) {
  try {
    const campaignId = req.params.campaignId;

    const [rows] = await pool.query(
      `SELECT b.*,
              c.title AS campaign_title,
              c.category AS campaign_category,
              c.platform AS campaign_platform,
              um.full_name AS marketer_name,
              uk.full_name AS koc_name,
              kp.display_name AS koc_display_name,
              kp.niche,
              kp.platform,
              kp.followers,
              kp.engagement_rate,
              kp.avatar_url
       FROM bookings b
       JOIN campaigns c ON b.campaign_id = c.id
       JOIN users um ON b.marketer_id = um.id
       JOIN users uk ON b.koc_id = uk.id
       LEFT JOIN koc_profiles kp ON uk.id = kp.user_id
       WHERE b.campaign_id = ?
       ORDER BY b.created_at DESC`,
      [campaignId]
    );

    res.json({ items: rows.map(bookingService.mapBookingRow) });
  } catch (error) {
    next(error);
  }
}

async function getBookingById(req, res, next) {
  try {
    let booking;
    if (req.user.role === "koc") {
      booking = await bookingService.getKocBookingDetail(req.params.id, req.user.id);
    } else {
      booking = await bookingService.getBookingById(req.params.id);

      if (booking && req.user.role === "marketer" && booking.marketerId !== req.user.id) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    if (!booking) return res.status(404).json({ message: "Booking not found" });
    res.json({ booking });
  } catch (error) {
    next(error);
  }
}

async function submitSubmission(req, res, next) {
  try {
    if (req.user.role !== "koc") {
      return res.status(403).json({ message: "Chi KOC moi duoc nop san pham." });
    }

    const validatedData = contentSubmissionSchema.parse(req.body);
    const booking = await bookingService.submitBookingSubmission(req.params.id, req.user.id, validatedData);

    return res.json({ message: "Da nop san pham cho Marketer.", booking });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    next(error);
  }
}

async function updateContent(req, res, next) {
  try {
    if (req.user.role !== "koc") {
      return res.status(403).json({ message: "Only KOC can update submission content" });
    }

    const validatedData = contentSubmissionSchema.parse(req.body);
    const booking = await bookingService.updateBookingContent(req.params.id, req.user.id, validatedData);
    res.json({ message: "Cap nhat san pham thanh cong", booking });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    next(error);
  }
}

async function reviewSubmission(req, res, next) {
  try {
    if (req.user.role !== "marketer") {
      return res.status(403).json({ message: "Chi Marketer moi duyet duoc bai nop." });
    }

    const result = await bookingService.reviewBookingSubmission(req.params.id, req.user.id, {
      action: req.body.action,
      reviewNote: req.body.reviewNote,
    });

    if (result && result.requiresPayment) {
      return res.json({
        message: "Cần thanh toán ngân sách để duyệt bài nộp.",
        requiresPayment: true,
        checkoutUrl: result.checkoutUrl,
        amount: result.amount,
      });
    }

    const booking = result.booking || result;

    const message =
      req.body.action === "approve"
        ? "Da duyet bai nop. Booking da hoan thanh va thu nhap KOC da duoc ghi nhan."
        : "Da gui yeu cau chinh sua cho KOC.";

    return res.json({ message, booking });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    next(error);
  }
}

async function updateBookingStatus(req, res, next) {
  try {
    const validatedData = bookingReviewSchema.parse(req.body);

    const booking = await bookingService.getBookingById(req.params.id);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    // Prevent KOC self-approval/rejection for koc_applied bookings
    if (req.user.role === "koc") {
      if (["accepted", "rejected"].includes(validatedData.status) && booking.direction === "koc_applied") {
        return res.status(403).json({ message: "KOC không thể tự chấp nhận hoặc từ chối đơn ứng tuyển của chính mình." });
      }
    }

    // Prevent Marketer self-approval/rejection for marketer_invited bookings
    if (req.user.role === "marketer") {
      if (["accepted", "rejected"].includes(validatedData.status) && booking.direction === "marketer_invited") {
        return res.status(403).json({ message: "Nhà tiếp thị không thể tự chấp nhận hoặc từ chối lời mời do chính mình gửi." });
      }
    }

    if (validatedData.status === "completed" && !booking.finalLink) {
      return res.status(400).json({ message: "Can co link video chinh thuc de hoan thanh job" });
    }

    const result = await bookingService.updateBookingStatus(req.params.id, validatedData.status);
    if (result && result.requiresPayment) {
      return res.json({
        message: "Cần thanh toán ngân sách để hoàn thành job.",
        requiresPayment: true,
        checkoutUrl: result.checkoutUrl,
        amount: result.amount,
      });
    }
    res.json({ message: "Cap nhat trang thai thanh cong", booking: result });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createBooking,
  listBookings,
  listMarketerSubmissions,
  listApplicantsByCampaign,
  getBookingById,
  submitSubmission,
  updateContent,
  reviewSubmission,
  updateBookingStatus,
};
