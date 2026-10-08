const aiService = require("../services/ai.service");
const guestAiUsageService = require("../services/guestAiUsage.service");
const { GUEST_AI_FEATURES, GUEST_AI_TRIAL_LIMIT } = require("../constants/guestAi");

const INPUT_LIMITS = Object.freeze({ autoBriefText: 6000, script: 12000, optionalField: 500 });

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.some((item) => String(item || "").trim());
}

function isValidAutoBriefResult(result) {
  return Boolean(
    result && typeof result === "object" && !Array.isArray(result) &&
    isNonEmptyString(result.campaignTitle) && isNonEmptyArray(result.objectives) &&
    isNonEmptyString(result.targetAudience) && isNonEmptyArray(result.contentDirection) &&
    isNonEmptyArray(result.keyMessages) && isNonEmptyArray(result.deliverables)
  );
}

function isValidScriptDoctorResult(result) {
  return Boolean(
    result && typeof result === "object" && !Array.isArray(result) &&
    isNonEmptyString(result.improvedHook) && isNonEmptyString(result.improvedScript) &&
    isNonEmptyString(result.strongerCTA) && isNonEmptyArray(result.contentTips) &&
    isNonEmptyArray(result.platformOptimization) && isNonEmptyArray(result.hashtagSuggestions)
  );
}

function getGuestId(req) {
  return req.get("x-kolab-guest-id");
}

function optionalFieldsAreValid(fields) {
  return Object.values(fields).every(
    (value) => value === null || value === undefined || String(value).length <= INPUT_LIMITS.optionalField
  );
}

function getScriptText(body = {}) {
  return [body.scriptText, body.script, body.originalScript, body.inputScript, body.rawScript]
    .find((value) => String(value || "").trim());
}

function handleError(error, res, next) {
  if (error instanceof guestAiUsageService.GuestAiUsageError) {
    const quota = error.code === "GUEST_TRIAL_EXHAUSTED"
      ? { limit: GUEST_AI_TRIAL_LIMIT, used: GUEST_AI_TRIAL_LIMIT, remaining: 0, requiresAuth: true }
      : {};
    return res.status(error.status).json({ code: error.code, message: error.message, ...quota });
  }
  if (error instanceof aiService.AiServiceUnavailableError || error?.code === aiService.AI_UNAVAILABLE_CODE) {
    aiService.logAiFailure(error.reason || "ai_unavailable", error.details || {});
    return res.status(503).json({
      success: false,
      code: aiService.AI_UNAVAILABLE_CODE,
      message: aiService.AI_UNAVAILABLE_MESSAGE,
    });
  }
  return next(error);
}

async function releaseReservation(reservation) {
  if (!reservation) return;
  try {
    await guestAiUsageService.finishRequest(reservation, false);
  } catch (error) {
    console.error("[ai] failed to release guest reservation", { message: error?.message });
  }
}

async function getQuota(req, res, next) {
  try {
    const quota = await guestAiUsageService.getQuota(getGuestId(req), req.query.feature);
    return res.json(quota);
  } catch (error) {
    return handleError(error, res, next);
  }
}

async function autoBrief(req, res, next) {
  let reservation = null;
  try {
    const body = req.body || {};
    const text = String(body.campaignIdea || body.inputText || "").trim();
    if (!text) return res.status(400).json({ message: "Vui lòng nhập ý tưởng chiến dịch." });
    if (text.length > INPUT_LIMITS.autoBriefText) {
      return res.status(400).json({ message: "Ý tưởng chiến dịch quá dài." });
    }
    const optionalFields = {
      brand: body.brand || null,
      product: body.product || null,
      platform: body.platform || null,
      targetAudience: body.targetAudience || null,
      budget: body.budget || null,
    };
    if (!optionalFieldsAreValid(optionalFields)) {
      return res.status(400).json({ message: "Thông tin chiến dịch quá dài." });
    }

    reservation = await guestAiUsageService.beginRequest(getGuestId(req), GUEST_AI_FEATURES.AUTO_BRIEF);
    const result = await aiService.generateAutoBrief(text, optionalFields, { maxOutputTokens: 2200 });
    if (!isValidAutoBriefResult(result)) {
      throw new aiService.AiServiceUnavailableError("invalid_response", { operation: "guest_auto_brief" });
    }
    const quota = await guestAiUsageService.finishRequest(reservation, true);
    reservation = null;
    return res.json({ message: "Tạo AI Brief thành công.", result, quota });
  } catch (error) {
    await releaseReservation(reservation);
    return handleError(error, res, next);
  }
}

async function scriptDoctor(req, res, next) {
  let reservation = null;
  try {
    const body = req.body || {};
    const script = String(getScriptText(body) || "").trim();
    if (!script) return res.status(400).json({ message: "Vui lòng nhập kịch bản." });
    if (script.length > INPUT_LIMITS.script) return res.status(400).json({ message: "Kịch bản quá dài." });
    const optionalFields = {
      platform: body.platform || null,
      tone: body.tone || null,
      product: body.product || null,
      targetAudience: body.targetAudience || null,
    };
    if (!optionalFieldsAreValid(optionalFields)) {
      return res.status(400).json({ message: "Thông tin kịch bản quá dài." });
    }

    reservation = await guestAiUsageService.beginRequest(getGuestId(req), GUEST_AI_FEATURES.SCRIPT_DOCTOR);
    const result = await aiService.generateScriptDoctor(script, optionalFields, {
      premium: false,
      maxOutputTokens: 1800,
    });
    if (!isValidScriptDoctorResult(result)) {
      throw new aiService.AiServiceUnavailableError("invalid_response", { operation: "guest_script_doctor" });
    }
    const quota = await guestAiUsageService.finishRequest(reservation, true);
    reservation = null;
    return res.json({ message: "Phân tích Script Doctor thành công.", result, quota });
  } catch (error) {
    await releaseReservation(reservation);
    return handleError(error, res, next);
  }
}

module.exports = { getQuota, autoBrief, scriptDoctor };
