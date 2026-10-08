const earningService = require("../services/earning.service");

async function getMyEarnings(req, res, next) {
  try {
    if (req.user.role === "koc") {
      const items = await earningService.listEarningsByKocId(req.user.id);
      return res.status(200).json({ items });
    }

    if (req.user.role === "admin") {
      const items = await earningService.listAllEarnings();
      return res.status(200).json({ items });
    }

    return res.status(403).json({ message: "Only koc can view own earnings" });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMyEarnings,
};
