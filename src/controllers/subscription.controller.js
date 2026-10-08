const subscriptionService = require("../services/subscription.service");

async function listPlans(req, res, next) {
  try {
    const plans = await subscriptionService.listPlans();
    return res.status(200).json(plans);
  } catch (error) {
    next(error);
  }
}

async function createCheckout(req, res, next) {
  try {
    const { planId } = req.body;
    const userId = req.user.id;

    if (!planId) {
      return res.status(400).json({ message: "Vui lòng chọn gói dịch vụ" });
    }

    const result = await subscriptionService.createSubscriptionCheckout(userId, planId);
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function getMySubscription(req, res, next) {
  try {
    const sub = await subscriptionService.getCurrentSubscription(req.user.id);
    return res.status(200).json(sub);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listPlans,
  createCheckout,
  getMySubscription
};
