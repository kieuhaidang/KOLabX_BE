const jwt = require("jsonwebtoken");

async function requireAuth(req, res, next) {
  try {
    let token = req.cookies?.token;

    if (!token) {
      const authHeader = req.headers.authorization || "";
      const [scheme, bearerToken] = authHeader.split(" ");
      if (scheme === "Bearer") {
        token = bearerToken;
      }
    }

    if (!token) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

/**
 * Middleware to restrict access to specific roles.
 * Usage: requireRole('marketer', 'admin')
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "Bạn không có quyền thực hiện hành động này" });
    }
    next();
  };
}

module.exports = {
  requireAuth,
  requireRole,
};
