const paymentService = require("../services/payment.service");
const payos = require("../config/payos");
const { createAuditLog } = require("../services/audit.service");

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function createLink(req, res, next) {
  try {
    const { amount, description, bookingId } = req.body;

    if (!amount || amount < 2000) {
      return res.status(400).json({ message: "Số tiền tối thiểu là 2,000 VND" });
    }

    const result = await paymentService.createPaymentLink(
      req.user.id,
      amount,
      description || "Thanh toan KOLab",
      bookingId
    );

    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

async function webhook(req, res) {
  let webhookData;
  try {
    webhookData = payos.verifyPaymentWebhookData(req.body);
  } catch (error) {
    console.error("Webhook Signature Verification Error:", error.message);
    return res.status(400).json({ message: "Invalid webhook signature" });
  }

  try {
    await paymentService.handleWebhook(webhookData);
    return res.status(200).json({ message: "Webhook processed" });
  } catch (error) {
    console.error("Webhook Processing Error:", error.message);
    // Non-2xx lets PayOS retry instead of silently losing a failed callback.
    return res.status(500).json({ message: "Webhook processing failed" });
  }
}

async function adminListPayments(req, res, next) {
  try {
    const data = await paymentService.listAdminPayments({
      status: req.query.status?.trim(),
      search: req.query.search?.trim(),
    });
    return res.status(200).json(data);
  } catch (error) {
    return next(error);
  }
}

async function adminGetPaymentById(req, res, next) {
  try {
    const paymentId = parsePositiveInt(req.params.id);
    if (!paymentId) {
      return res.status(400).json({ message: "Invalid payment id" });
    }

    const payment = await paymentService.getAdminPaymentById(paymentId);
    if (!payment) {
      return res.status(404).json({ message: "Payment not found" });
    }

    return res.status(200).json({ payment });
  } catch (error) {
    return next(error);
  }
}

async function adminConfirmPayment(req, res, next) {
  try {
    const paymentId = parsePositiveInt(req.params.id);
    if (!paymentId) {
      return res.status(400).json({ message: "Invalid payment id" });
    }

    const payment = await paymentService.confirmAdminPayment(paymentId, req.user.id);

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "admin.payment.confirm",
      targetType: "payment",
      targetId: paymentId,
      description: `Payment confirmed; booking ${payment?.bookingId || "unknown"} ready_to_connect`,
    });

    return res.status(200).json({
      message: "Da xac nhan thanh toan va mo khoa booking",
      payment,
    });
  } catch (error) {
    return next(error);
  }
}

async function adminRejectPayment(req, res, next) {
  try {
    const paymentId = parsePositiveInt(req.params.id);
    if (!paymentId) {
      return res.status(400).json({ message: "Invalid payment id" });
    }

    const rejectionReason = req.body?.rejectionReason;
    const payment = await paymentService.rejectAdminPayment(paymentId, req.user.id, rejectionReason);

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "admin.payment.reject",
      targetType: "payment",
      targetId: paymentId,
      description: `Payment rejected; booking ${payment?.bookingId || "unknown"} payment_rejected`,
    });

    return res.status(200).json({
      message: "Da tu choi thanh toan",
      payment,
    });
  } catch (error) {
    return next(error);
  }
}

async function verifyPayment(req, res, next) {
  try {
    const orderCode = Number(req.params.orderCode);
    if (isNaN(orderCode)) {
      return res.status(400).json({ message: "Mã đơn hàng không hợp lệ" });
    }

    // Call PayOS API to get current payment status
    const paymentInfo = await payos.getPaymentLinkInformation(orderCode);
    
    // Update internal database status based on the retrieved paymentInfo
    await paymentService.handleWebhook(paymentInfo);

    return res.status(200).json({
      orderCode: paymentInfo.orderCode,
      status: paymentInfo.status,
    });
  } catch (error) {
    console.error("Payment Verification Error:", error.message);
    return res.status(400).json({ message: "Không tìm thấy thông tin thanh toán từ PayOS" });
  }
}

async function verifyCampaignPayment(req, res, next) {
  try {
    const orderCode = parsePositiveInt(req.params.orderCode);
    if (!orderCode) {
      return res.status(400).json({ message: "Ma don hang khong hop le" });
    }

    const result = await paymentService.verifyCampaignPayment(orderCode, req.user.id);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createLink,
  webhook,
  adminListPayments,
  adminGetPaymentById,
  adminConfirmPayment,
  adminRejectPayment,
  verifyPayment,
  verifyCampaignPayment,
};
