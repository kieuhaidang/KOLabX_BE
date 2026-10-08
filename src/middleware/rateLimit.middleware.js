const rateLimit = require("express-rate-limit");

/** General API protection — all /api routes */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Stricter limit for admin/owner management APIs */
const adminOwnerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  message: { message: "Quá nhiều thao tác quản trị. Vui lòng thử lại sau." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Login / register brute-force protection */
const authSensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Quá nhiều lần đăng nhập. Vui lòng thử lại sau 15 phút." },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Additional IP protection for public AI trials. Database quotas remain authoritative. */
const guestAiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    code: "GUEST_IP_RATE_LIMITED",
    message: "Qu\u00e1 nhi\u1ec1u y\u00eau c\u1ea7u d\u00f9ng th\u1eed AI. Vui l\u00f2ng th\u1eed l\u1ea1i sau.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  adminOwnerLimiter,
  authSensitiveLimiter,
  guestAiLimiter,
};
