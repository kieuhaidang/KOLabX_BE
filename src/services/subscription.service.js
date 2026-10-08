const { pool } = require("../config/db");
const payos = require("../config/payos");

function generateOrderCode() {
  return Math.floor(100000 + Math.random() * 900000000);
}

async function listPlans() {
  const [rows] = await pool.query(
    "SELECT id, name, description, price, duration_days, features FROM subscription_plans WHERE is_active = TRUE ORDER BY price ASC"
  );
  return rows;
}

async function createSubscriptionCheckout(userId, planId) {
  const [planRows] = await pool.query(
    "SELECT id, name, price FROM subscription_plans WHERE id = ? AND is_active = TRUE LIMIT 1",
    [planId]
  );
  const plan = planRows[0];

  if (!plan) {
    const error = new Error("Gói dịch vụ không tồn tại hoặc đã ngừng cung cấp");
    error.status = 404;
    throw error;
  }

  if (plan.price <= 0) {
    // Luồng cho gói miễn phí - kích hoạt ngay
    await activateSubscription(userId, planId);
    return { checkoutUrl: "/marketer/dashboard", isFree: true };
  }

  const orderCode = generateOrderCode();
  let domain = process.env.FRONTEND_URL || "https://kolabbooking.com";
  if (!domain.startsWith("http")) domain = `https://${domain}`;
  
  const cancelUrl = `${domain}/payment/cancel`;
  const returnUrl = `${domain}/payment/success`;

  const body = {
    orderCode,
    amount: Number(plan.price),
    description: `Mua goi ${plan.name}`.substring(0, 25),
    cancelUrl,
    returnUrl,
  };

  try {
    const paymentLinkRes = await payos.createPaymentLink(body);

    await pool.query(
      `INSERT INTO payments (user_id, order_code, amount, description, payos_order_id, checkout_url, payment_type, subscription_plan_id, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, 'subscription', ?, 'payos')`,
      [userId, orderCode, plan.price, body.description, paymentLinkRes.paymentRequestId, paymentLinkRes.checkoutUrl, planId]
    );

    return paymentLinkRes;
  } catch (error) {
    console.error("PayOS Subscription Checkout Error:", error);
    throw new Error("Không thể tạo link thanh toán cho gói dịch vụ");
  }
}

async function activateSubscription(userId, planId) {
  const [planRows] = await pool.query(
    "SELECT duration_days FROM subscription_plans WHERE id = ? LIMIT 1",
    [planId]
  );
  const plan = planRows[0];
  if (!plan) return;

  const duration = plan.duration_days;
  
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Hủy các gói cũ đang active của user
    await connection.query(
      "UPDATE subscriptions SET status = 'cancelled' WHERE marketer_id = ? AND status = 'active'",
      [userId]
    );

    // Thêm gói mới
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(startDate.getDate() + duration);

    await connection.query(
      "INSERT INTO subscriptions (marketer_id, plan_id, start_date, end_date, status) VALUES (?, ?, ?, ?, 'active')",
      [userId, planId, startDate, endDate]
    );

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    console.error("Activate Subscription Error:", error);
    throw error;
  } finally {
    connection.release();
  }
}

async function getCurrentSubscription(userId) {
    const [rows] = await pool.query(
        `SELECT s.*, p.name as plan_name, p.features 
         FROM subscriptions s
         JOIN subscription_plans p ON s.plan_id = p.id
         WHERE s.marketer_id = ? AND s.status = 'active' AND s.end_date > NOW()
         LIMIT 1`,
        [userId]
    );
    return rows[0] || null;
}

module.exports = {
  listPlans,
  createSubscriptionCheckout,
  activateSubscription,
  getCurrentSubscription
};
