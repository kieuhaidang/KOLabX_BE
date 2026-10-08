const { pool } = require("../config/db");
const payos = require("../config/payos");
const subscriptionService = require("./subscription.service");
const campaignService = require("./campaign.service");

function generateOrderCode() {
  return Math.floor(100000 + Math.random() * 900000000);
}

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getFrontendDomain() {
  let domain = process.env.FRONTEND_URL || "https://kolabbooking.com";
  if (!domain.startsWith("http")) domain = `https://${domain}`;
  return domain.replace(/\/+$/, "");
}

function buildCampaignPaymentBody(orderCode, amount, description) {
  const domain = getFrontendDomain();
  return {
    orderCode,
    amount,
    description: description.replace(/#/g, "").substring(0, 25),
    cancelUrl: `${domain}/marketer/campaigns/payment-cancel`,
    returnUrl: `${domain}/marketer/campaigns/payment-success`,
  };
}

async function getCampaignCheckoutByIdempotencyKey(userId, idempotencyKey) {
  const [rows] = await pool.query(
    `SELECT id, campaign_id, order_code, checkout_url
     FROM payments
     WHERE user_id = ? AND idempotency_key = ? AND payment_type = 'campaign'
     LIMIT 1`,
    [userId, idempotencyKey]
  );
  const payment = rows[0];
  if (!payment?.checkout_url) return null;

  const campaign = await campaignService.getCampaignById(payment.campaign_id);
  if (!campaign) return null;
  return {
    campaignId: campaign.id,
    paymentId: payment.id,
    orderCode: Number(payment.order_code),
    checkoutUrl: payment.checkout_url,
    campaign,
  };
}

async function createCampaignCheckout(userId, payload, idempotencyKey) {
  const normalizedKey = String(idempotencyKey || "").trim();
  if (!normalizedKey || normalizedKey.length > 64) {
    throw createHttpError("Idempotency-Key khong hop le", 400);
  }

  const existingCheckout = await getCampaignCheckoutByIdempotencyKey(userId, normalizedKey);
  if (existingCheckout) return existingCheckout;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [existingRows] = await connection.query(
      `SELECT id, campaign_id, order_code, checkout_url
       FROM payments
       WHERE user_id = ? AND idempotency_key = ? AND payment_type = 'campaign'
       LIMIT 1 FOR UPDATE`,
      [userId, normalizedKey]
    );
    if (existingRows[0]?.checkout_url) {
      await connection.commit();
      return getCampaignCheckoutByIdempotencyKey(userId, normalizedKey);
    }

    const campaign = await campaignService.createCampaign(userId, payload, connection);
    const orderCode = generateOrderCode();
    const description = `Coc campaign #${campaign.id}`;
    const body = buildCampaignPaymentBody(orderCode, campaign.budget, description);
    const [paymentResult] = await connection.query(
      `INSERT INTO payments
        (user_id, campaign_id, order_code, amount, payment_type, description, payment_method, status, idempotency_key)
       VALUES (?, ?, ?, ?, 'campaign', ?, 'payos', 'pending', ?)`,
      [userId, campaign.id, orderCode, campaign.budget, description, normalizedKey]
    );

    const paymentLinkRes = await payos.createPaymentLink(body);
    await connection.query(
      "UPDATE payments SET payos_order_id = ?, checkout_url = ? WHERE id = ?",
      [paymentLinkRes.paymentRequestId, paymentLinkRes.checkoutUrl, paymentResult.insertId]
    );
    await connection.commit();

    return {
      campaignId: campaign.id,
      paymentId: paymentResult.insertId,
      orderCode,
      checkoutUrl: paymentLinkRes.checkoutUrl,
      campaign,
    };
  } catch (error) {
    await connection.rollback();
    if (error?.code === "ER_DUP_ENTRY") {
      const duplicateCheckout = await getCampaignCheckoutByIdempotencyKey(userId, normalizedKey);
      if (duplicateCheckout) return duplicateCheckout;
    }
    console.error("PayOS Campaign Checkout Error:", error);
    if (error.status) throw error;
    throw createHttpError("Khong the khoi tao thanh toan chien dich", 502);
  } finally {
    connection.release();
  }
}

async function getOrCreateCampaignPaymentLink(userId, campaignId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [[campaignRow]] = await connection.query(
      "SELECT id, marketer_id, budget, status FROM campaigns WHERE id = ? LIMIT 1 FOR UPDATE",
      [campaignId]
    );
    if (!campaignRow || Number(campaignRow.marketer_id) !== Number(userId)) {
      throw createHttpError("Campaign not found", 404);
    }
    if (campaignRow.status !== "pending_payment") {
      throw createHttpError("Chien dich khong o trang thai cho thanh toan", 409);
    }

    const [[existingPayment]] = await connection.query(
      `SELECT id, order_code, checkout_url
       FROM payments
       WHERE campaign_id = ? AND payment_type = 'campaign' AND status = 'pending' AND checkout_url IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`,
      [campaignId]
    );
    if (existingPayment) {
      await connection.commit();
      return {
        campaignId: Number(campaignId),
        paymentId: existingPayment.id,
        orderCode: Number(existingPayment.order_code),
        checkoutUrl: existingPayment.checkout_url,
      };
    }

    const orderCode = generateOrderCode();
    const description = `Coc campaign #${campaignId}`;
    const body = buildCampaignPaymentBody(orderCode, Number(campaignRow.budget), description);
    const [paymentResult] = await connection.query(
      `INSERT INTO payments
        (user_id, campaign_id, order_code, amount, payment_type, description, payment_method, status)
       VALUES (?, ?, ?, ?, 'campaign', ?, 'payos', 'pending')`,
      [userId, campaignId, orderCode, Number(campaignRow.budget), description]
    );
    const paymentLinkRes = await payos.createPaymentLink(body);
    await connection.query(
      "UPDATE payments SET payos_order_id = ?, checkout_url = ? WHERE id = ?",
      [paymentLinkRes.paymentRequestId, paymentLinkRes.checkoutUrl, paymentResult.insertId]
    );
    await connection.commit();

    return {
      campaignId: Number(campaignId),
      paymentId: paymentResult.insertId,
      orderCode,
      checkoutUrl: paymentLinkRes.checkoutUrl,
    };
  } catch (error) {
    await connection.rollback();
    if (error.status) throw error;
    console.error("PayOS Campaign Retry Error:", error);
    throw createHttpError("Khong the khoi tao lai thanh toan chien dich", 502);
  } finally {
    connection.release();
  }
}

async function createPaymentLink(userId, amount, description, bookingId = null, campaignId = null) {
  const orderCode = generateOrderCode();
  
  // URL quay lại sau khi thanh toán (Yêu cầu URL tuyệt đối)
  let domain = process.env.FRONTEND_URL || "https://kolabbooking.com";
  if (!domain.startsWith("http")) domain = `https://${domain}`;
  
  const cancelUrl = `${domain}/payment/cancel`;
  const returnUrl = `${domain}/payment/success`;

  // PayOS description does not allow special characters like #
  const cleanDescription = description.replace(/#/g, "").substring(0, 25);

  const body = {
    orderCode,
    amount,
    description: cleanDescription,
    cancelUrl,
    returnUrl,
  };

  try {
    const paymentLinkRes = await payos.createPaymentLink(body);

    const paymentType = campaignId ? 'campaign' : 'booking';

    await pool.query(
      `INSERT INTO payments (user_id, booking_id, campaign_id, order_code, amount, payment_type, description, payos_order_id, checkout_url, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'payos')`,
      [userId, bookingId, campaignId, orderCode, amount, paymentType, description, paymentLinkRes.paymentRequestId, paymentLinkRes.checkoutUrl]
    );

    return paymentLinkRes;
  } catch (error) {
    console.error("PayOS Create Error:", error);
    throw new Error("Khong the tao link thanh toan");
  }
}

async function handleWebhook(webhookData) {
  const { orderCode, status } = webhookData;

  let internalStatus = "pending";
  if (status === "PAID") internalStatus = "paid";
  if (status === "CANCELLED") internalStatus = "cancelled";
  if (status === "EXPIRED") internalStatus = "expired";

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Lấy thông tin payment để kiểm tra type
    const [paymentRows] = await connection.query(
      "SELECT user_id, booking_id, campaign_id, payment_type, subscription_plan_id, status, amount FROM payments WHERE order_code = ? LIMIT 1 FOR UPDATE",
      [orderCode]
    );
    const payment = paymentRows[0];

    if (!payment) {
      await connection.rollback();
      return false;
    }

    if (internalStatus === "paid" && webhookData.amount !== undefined
      && Number(webhookData.amount) !== Number(payment.amount)) {
      throw createHttpError("Payment amount does not match", 409);
    }

    if (payment.status === "confirmed") {
      await connection.commit();
      return true;
    }

    // Cập nhật trạng thái payment
    await connection.query(
      `UPDATE payments
       SET status = ?,
           submitted_at = CASE WHEN ? = 'paid' THEN COALESCE(submitted_at, NOW()) ELSE submitted_at END
       WHERE order_code = ?
         AND status NOT IN ('confirmed', 'rejected')`,
      [internalStatus, internalStatus, orderCode]
    );

    // Nếu là thanh toán gói và thành công -> Kích hoạt gói
    if (internalStatus === "paid" && payment.payment_type === "subscription" && payment.subscription_plan_id) {
        await subscriptionService.activateSubscription(payment.user_id, payment.subscription_plan_id);
    }

    // Nếu là thanh toán ngân sách chiến dịch thành công -> Chuyển trạng thái chiến dịch hoạt động
    if (internalStatus === "paid" && payment.payment_type === "campaign" && payment.campaign_id) {
        await connection.query(
          `UPDATE payments SET status = 'confirmed', reviewed_at = NOW() WHERE order_code = ?`,
          [orderCode]
        );
        
        const [[campaignRow]] = await connection.query(
          "SELECT status, start_date, budget, remaining_budget FROM campaigns WHERE id = ? FOR UPDATE",
          [payment.campaign_id]
        );
        
        if (campaignRow) {
          const amountPaid = Number(payment.amount || 0);
          const isInitialPayment = campaignRow.status === "pending_payment";
          const newRemaining = isInitialPayment
            ? Number(campaignRow.budget || amountPaid)
            : Number(campaignRow.remaining_budget || 0) + amountPaid;
          // If status was pending_payment, the budget is already set to the initial amount in DB, so we don't add it again.
          // If it was already active/open, it's a top-up, so we increase the total budget.
          const newBudget = Number(campaignRow.budget || 0) + (isInitialPayment ? 0 : amountPaid);

          let nextStatus = campaignRow.status;
          if (isInitialPayment) {
            const now = new Date();
            const startDate = campaignRow.start_date ? new Date(campaignRow.start_date) : now;
            nextStatus = startDate > now ? "scheduled" : "open";
          }

          await connection.query(
            "UPDATE campaigns SET status = ?, budget = ?, remaining_budget = ? WHERE id = ?",
            [nextStatus, newBudget, newRemaining, payment.campaign_id]
          );
        }
    }

    // Nếu là thanh toán cọc Booking và thành công -> Chuyển trạng thái Booking sang hoàn thành (completed)
    if (internalStatus === "paid" && payment.payment_type === "booking" && payment.booking_id) {
        // Tự động xác nhận thanh toán PayOS và chuyển trạng thái booking
        await connection.query(
          `UPDATE payments SET status = 'confirmed', reviewed_at = NOW() WHERE order_code = ?`,
          [orderCode]
        );

        // Lấy thông tin booking để cập nhật ngân sách chiến dịch tương ứng
        const [[bookingRow]] = await connection.query(
          "SELECT campaign_id, offered_price FROM bookings WHERE id = ? LIMIT 1",
          [payment.booking_id]
        );

        if (bookingRow) {
          const bookingPrice = Number(bookingRow.offered_price || 0);
          const payAmount = Number(payment.amount || 0);
          await connection.query(
            "UPDATE campaigns SET remaining_budget = remaining_budget + ? - ? WHERE id = ?",
            [payAmount, bookingPrice, bookingRow.campaign_id]
          );
        }

        await connection.query(
          "UPDATE bookings SET status = 'completed', reviewed_at = NOW() WHERE id = ?",
          [payment.booking_id]
        );
    }

    await connection.commit();

    // Ghi nhận thu nhập cho KOC sau khi commit thành công
    if (internalStatus === "paid" && payment.payment_type === "booking" && payment.booking_id) {
        try {
          const bookingService = require("./booking.service");
          const earningService = require("./earning.service");
          const updatedBooking = await bookingService.getBookingById(payment.booking_id);
          if (updatedBooking) {
            await earningService.createEarningForBooking(updatedBooking);
          }
        } catch (earningErr) {
          console.error("Error creating earning for booking in webhook:", earningErr.message);
        }
    }
    return true;
  } catch (error) {
    await connection.rollback();
    console.error("Webhook Processing Error:", error);
    throw error;
  } finally {
    connection.release();
  }
}

async function getCampaignPaymentRecord(orderCode, userId) {
  const [rows] = await pool.query(
    `SELECT p.id, p.order_code, p.status, p.campaign_id, p.checkout_url
     FROM payments p
     INNER JOIN campaigns c ON c.id = p.campaign_id
     WHERE p.order_code = ?
       AND p.user_id = ?
       AND c.marketer_id = ?
       AND p.payment_type = 'campaign'
     LIMIT 1`,
    [orderCode, userId, userId]
  );
  return rows[0] || null;
}

async function verifyCampaignPayment(orderCode, userId) {
  let payment = await getCampaignPaymentRecord(orderCode, userId);
  if (!payment) throw createHttpError("Campaign payment not found", 404);

  let providerStatus = payment.status === "confirmed" ? "PAID" : null;
  if (payment.status !== "confirmed") {
    const paymentInfo = await payos.getPaymentLinkInformation(orderCode);
    providerStatus = paymentInfo.status;
    await handleWebhook(paymentInfo);
    payment = await getCampaignPaymentRecord(orderCode, userId);
  }

  const campaign = await campaignService.getCampaignById(payment.campaign_id);
  return {
    orderCode: Number(payment.order_code),
    paymentId: payment.id,
    status: payment.status,
    providerStatus,
    checkoutUrl: payment.checkout_url,
    campaign,
  };
}

function mapAdminPaymentRow(row) {
  return {
    id: row.id,
    paymentId: row.id,
    bookingId: row.booking_id,
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title,
    marketerId: row.marketer_id,
    marketerName: row.marketer_name,
    marketerEmail: row.marketer_email,
    kocId: row.koc_id,
    kocName: row.koc_display_name || row.koc_name,
    kocEmail: row.koc_email,
    amount: Number(row.amount || 0),
    paymentMethod: row.payment_method || "payos",
    transactionCode: row.order_code ? String(row.order_code) : null,
    paymentProofUrl: row.payment_proof_url,
    submittedAt: row.submitted_at || row.payment_updated_at || row.payment_created_at,
    status: row.status,
    reviewedByAdminId: row.reviewed_by_admin_id,
    reviewedByAdminName: row.reviewed_by_admin_name,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    bookingStatus: row.booking_status,
    createdAt: row.payment_created_at,
    updatedAt: row.payment_updated_at,
  };
}

function buildAdminPaymentsWhere(filters = {}) {
  const conditions = ["1 = 1"];
  const params = [];

  if (filters.status) {
    if (filters.status === "pending") {
      conditions.push("p.status IN ('pending', 'paid')");
    } else {
      conditions.push("p.status = ?");
      params.push(filters.status);
    }
  }

  if (filters.search) {
    const keyword = `%${filters.search}%`;
    conditions.push(`(
      CAST(p.id AS CHAR) LIKE ?
      OR CAST(p.booking_id AS CHAR) LIKE ?
      OR CAST(p.order_code AS CHAR) LIKE ?
      OR c.title LIKE ?
      OR marketer.full_name LIKE ?
      OR marketer.email LIKE ?
      OR koc.full_name LIKE ?
      OR koc.email LIKE ?
      OR kp.display_name LIKE ?
    )`);
    params.push(keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword, keyword);
  }

  return { whereSql: conditions.join(" AND "), params };
}

async function listAdminPayments(filters = {}) {
  const { whereSql, params } = buildAdminPaymentsWhere(filters);

  const [rows] = await pool.query(
    `SELECT
      p.id,
      p.booking_id,
      p.order_code,
      p.amount,
      p.status,
      p.payment_method,
      p.payment_proof_url,
      p.submitted_at,
      p.reviewed_by_admin_id,
      p.reviewed_at,
      p.rejection_reason,
      p.created_at AS payment_created_at,
      p.updated_at AS payment_updated_at,
      b.status AS booking_status,
      c.id AS campaign_id,
      c.title AS campaign_title,
      marketer.id AS marketer_id,
      marketer.full_name AS marketer_name,
      marketer.email AS marketer_email,
      koc.id AS koc_id,
      koc.full_name AS koc_name,
      koc.email AS koc_email,
      kp.display_name AS koc_display_name,
      reviewer.full_name AS reviewed_by_admin_name
     FROM payments p
     LEFT JOIN bookings b ON b.id = p.booking_id
     LEFT JOIN campaigns c ON c.id = b.campaign_id
     LEFT JOIN users marketer ON marketer.id = b.marketer_id
     LEFT JOIN users koc ON koc.id = b.koc_id
     LEFT JOIN koc_profiles kp ON kp.user_id = b.koc_id
     LEFT JOIN users reviewer ON reviewer.id = p.reviewed_by_admin_id
     WHERE ${whereSql}
     ORDER BY COALESCE(p.submitted_at, p.updated_at, p.created_at) DESC`,
    params
  );

  const [[summaryRow]] = await pool.query(
    `SELECT
      SUM(CASE WHEN status IN ('pending', 'paid') THEN 1 ELSE 0 END) AS pending_count,
      SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed_count,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count
     FROM payments`
  );

  return {
    items: rows.map(mapAdminPaymentRow),
    summary: {
      pending: Number(summaryRow?.pending_count || 0),
      confirmed: Number(summaryRow?.confirmed_count || 0),
      rejected: Number(summaryRow?.rejected_count || 0),
    },
  };
}

async function getAdminPaymentById(paymentId) {
  const [rows] = await pool.query(
    `SELECT
      p.id,
      p.booking_id,
      p.order_code,
      p.amount,
      p.status,
      p.payment_method,
      p.payment_proof_url,
      p.submitted_at,
      p.reviewed_by_admin_id,
      p.reviewed_at,
      p.rejection_reason,
      p.created_at AS payment_created_at,
      p.updated_at AS payment_updated_at,
      b.status AS booking_status,
      c.id AS campaign_id,
      c.title AS campaign_title,
      marketer.id AS marketer_id,
      marketer.full_name AS marketer_name,
      marketer.email AS marketer_email,
      koc.id AS koc_id,
      koc.full_name AS koc_name,
      koc.email AS koc_email,
      kp.display_name AS koc_display_name,
      reviewer.full_name AS reviewed_by_admin_name
     FROM payments p
     LEFT JOIN bookings b ON b.id = p.booking_id
     LEFT JOIN campaigns c ON c.id = b.campaign_id
     LEFT JOIN users marketer ON marketer.id = b.marketer_id
     LEFT JOIN users koc ON koc.id = b.koc_id
     LEFT JOIN koc_profiles kp ON kp.user_id = b.koc_id
     LEFT JOIN users reviewer ON reviewer.id = p.reviewed_by_admin_id
     WHERE p.id = ?
     LIMIT 1`,
    [paymentId]
  );

  return rows[0] ? mapAdminPaymentRow(rows[0]) : null;
}

async function confirmAdminPayment(paymentId, adminId) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [paymentRows] = await connection.query(
      "SELECT * FROM payments WHERE id = ? LIMIT 1 FOR UPDATE",
      [paymentId]
    );
    const payment = paymentRows[0];
    if (!payment) throw createHttpError("Payment not found", 404);

    if (["confirmed", "rejected"].includes(payment.status)) {
      throw createHttpError("Payment has already been reviewed", 409);
    }

    if (payment.status !== "paid") {
      throw createHttpError("Payment must be paid before Admin confirmation", 409);
    }

    if (!payment.booking_id) {
      throw createHttpError("Booking not found for this payment", 404);
    }

    const [bookingRows] = await connection.query(
      "SELECT id, status FROM bookings WHERE id = ? LIMIT 1 FOR UPDATE",
      [payment.booking_id]
    );
    const booking = bookingRows[0];
    if (!booking) throw createHttpError("Booking not found", 404);

    if (["cancelled", "completed", "rejected", "payment_rejected"].includes(booking.status)) {
      throw createHttpError("Booking is not in a confirmable state", 409);
    }

    await connection.query(
      `UPDATE payments
       SET status = 'confirmed',
           reviewed_by_admin_id = ?,
           reviewed_at = NOW(),
           rejection_reason = NULL
       WHERE id = ?`,
      [adminId, paymentId]
    );

    await connection.query(
      "UPDATE bookings SET status = 'ready_to_connect' WHERE id = ?",
      [payment.booking_id]
    );

    await connection.commit();
    return getAdminPaymentById(paymentId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function rejectAdminPayment(paymentId, adminId, rejectionReason) {
  const reason = String(rejectionReason || "").trim();
  if (!reason) {
    throw createHttpError("Rejection reason is required", 400);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [paymentRows] = await connection.query(
      "SELECT * FROM payments WHERE id = ? LIMIT 1 FOR UPDATE",
      [paymentId]
    );
    const payment = paymentRows[0];
    if (!payment) throw createHttpError("Payment not found", 404);

    if (["confirmed", "rejected"].includes(payment.status)) {
      throw createHttpError("Payment has already been reviewed", 409);
    }

    if (["cancelled", "expired"].includes(payment.status)) {
      throw createHttpError("Payment is not in a rejectable state", 409);
    }

    if (!payment.booking_id) {
      throw createHttpError("Booking not found for this payment", 404);
    }

    const [bookingRows] = await connection.query(
      "SELECT id, status FROM bookings WHERE id = ? LIMIT 1 FOR UPDATE",
      [payment.booking_id]
    );
    const booking = bookingRows[0];
    if (!booking) throw createHttpError("Booking not found", 404);

    if (["cancelled", "completed", "rejected"].includes(booking.status)) {
      throw createHttpError("Booking is not in a rejectable state", 409);
    }

    await connection.query(
      `UPDATE payments
       SET status = 'rejected',
           reviewed_by_admin_id = ?,
           reviewed_at = NOW(),
           rejection_reason = ?
       WHERE id = ?`,
      [adminId, reason, paymentId]
    );

    await connection.query(
      "UPDATE bookings SET status = 'payment_rejected' WHERE id = ?",
      [payment.booking_id]
    );

    await connection.commit();
    return getAdminPaymentById(paymentId);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

module.exports = {
  createCampaignCheckout,
  getOrCreateCampaignPaymentLink,
  createPaymentLink,
  handleWebhook,
  verifyCampaignPayment,
  listAdminPayments,
  getAdminPaymentById,
  confirmAdminPayment,
  rejectAdminPayment,
};
