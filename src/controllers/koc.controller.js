const kocSubscriptionService = require("../services/kocSubscription.service");

async function getSubscription(req, res, next) {
  try {
    if (req.user.role !== "koc") {
      return res.status(403).json({ message: "Only koc can access subscription" });
    }
    const subscription = await kocSubscriptionService.getSubscription(req.user.id);
    return res.status(200).json({ subscription });
  } catch (error) {
    return next(error);
  }
}

async function upgradePlus(req, res, next) {
  try {
    if (req.user.role !== "koc") {
      return res.status(403).json({ message: "Only koc can upgrade subscription" });
    }
    const subscription = await kocSubscriptionService.upgradeToPlus(req.user.id);
    return res.status(200).json({
      message: "Upgraded to Plus (dev mode)",
      subscription,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getSubscription,
  upgradePlus,
};

