const aiService = require("../services/ai.service");
const kocSubscriptionService = require("../services/kocSubscription.service");

function getUserId(req) {
  return req.user?.id || req.user?.userId || req.user?.user_id;
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.some((item) => String(item || "").trim());
}

function isValidScriptDoctorResult(result) {
  return Boolean(
    result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      isNonEmptyString(result.improvedHook) &&
      isNonEmptyString(result.improvedScript) &&
      isNonEmptyString(result.strongerCTA) &&
      isNonEmptyArray(result.contentTips) &&
      isNonEmptyArray(result.platformOptimization) &&
      isNonEmptyArray(result.hashtagSuggestions)
  );
}

function mapScriptOptionalFields(body = {}) {
  return {
    platform: body.platform || null,
    tone: body.tone || null,
    product: body.product || null,
    targetAudience: body.targetAudience || null,
  };
}

function getScriptTextFromBody(body = {}) {
  return [body.scriptText, body.script, body.originalScript, body.inputScript, body.rawScript]
    .find((value) => String(value || "").trim());
}

function handleAiError(error, res, next) {
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

async function autoBrief(req, res, next) {
  try {
    const marketerId = getUserId(req);
    const { campaignIdea, inputText, brand, product, platform, targetAudience, budget } = req.body;
    const text = campaignIdea || inputText;

    if (!text || !String(text).trim()) {
      return res.status(400).json({ message: "Vui lòng nhập ý tưởng chiến dịch." });
    }

    const optionalFields = {
      brand: brand || null,
      product: product || null,
      platform: platform || null,
      targetAudience: targetAudience || null,
      budget: budget || null,
    };

    const result = await aiService.generateAutoBrief(text.trim(), optionalFields);

    let item = null;
    if (marketerId) {
      const id = await aiService.saveAutoBrief(marketerId, {
        inputText: text.trim(),
        optionalFields,
        result,
      });
      item = await aiService.getBriefById(id);
    }

    return res.json({
      message: "Tạo AI Brief thành công.",
      result,
      item,
    });
  } catch (error) {
    return handleAiError(error, res, next);
  }
}

async function scriptDoctor(req, res, next) {
  try {
    const kocId = getUserId(req);
    const { platform, tone, product, targetAudience } = req.body;
    const script = getScriptTextFromBody(req.body);

    if (!script || !String(script).trim()) {
      return res.status(400).json({ message: "Vui lòng nhập kịch bản." });
    }

    const subscription = await kocSubscriptionService.getSubscription(kocId);
    if (subscription.used >= subscription.limit) {
      return res.status(403).json({
        message:
          "Bạn đã hết lượt AI trong tháng. Nâng cấp Plus để nhận thêm lượt và được ưu tiên hiển thị.",
        quota: {
          plan: subscription.plan,
          aiMonthlyLimit: subscription.limit,
          aiUsedThisMonth: subscription.used,
          remaining: subscription.remaining,
          isSearchBoosted: subscription.isSearchBoosted,
        },
      });
    }

    const optionalFields = mapScriptOptionalFields({ platform, tone, product, targetAudience });

    const result = await aiService.generateScriptDoctor(script.trim(), optionalFields, {
      premium: subscription.plan === "plus",
    });

    const usage = await kocSubscriptionService.consumeScriptDoctorUsage(kocId);

    let item = null;
    let historySaveFailed = false;
    if (kocId) {
      try {
        const id = await aiService.saveScriptDoctor(kocId, {
          inputScript: script.trim(),
          optionalFields,
          result,
        });
        item = await aiService.getScriptReviewById(id);
      } catch (saveError) {
        historySaveFailed = true;
        console.error("[ai] script review history save failed", {
          kocId,
          message: saveError?.message,
        });
      }
    }

    return res.json({
      message: historySaveFailed
        ? "Phân tích thành công nhưng chưa thể lưu vào lịch sử."
        : "Phân tích Script Doctor thành công.",
      result,
      item,
      usage: {
        plan: usage.plan,
        used: usage.used,
        limit: usage.limit,
        remaining: Math.max(0, usage.limit - usage.used),
        resetAt: usage.resetAt,
        isSearchBoosted: usage.isSearchBoosted,
      },
    });
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    return handleAiError(error, res, next);
  }
}

async function getQuota(req, res, next) {
  try {
    const quota = await kocSubscriptionService.getQuota(getUserId(req));
    return res.json(quota);
  } catch (error) {
    return next(error);
  }
}

async function upgradePlus(req, res, next) {
  try {
    const subscription = await kocSubscriptionService.upgradeToPlus(getUserId(req));
    return res.json({
      message: "Nâng cấp Plus thành công.",
      plan: subscription.plan,
      aiMonthlyLimit: subscription.limit,
      aiUsedThisMonth: subscription.used,
      remaining: subscription.remaining,
      isSearchBoosted: subscription.isSearchBoosted,
      resetAt: subscription.resetAt,
    });
  } catch (error) {
    return next(error);
  }
}

async function listMyBriefs(req, res, next) {
  try {
    const marketerId = getUserId(req);
    const items = await aiService.listBriefsByMarketerId(marketerId);
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function listMyScriptReviews(req, res, next) {
  try {
    const kocId = getUserId(req);
    const items = await aiService.listScriptReviewsByKocId(kocId);
    return res.json({ items });
  } catch (error) {
    return next(error);
  }
}

async function updateScriptReview(req, res, next) {
  try {
    const kocId = getUserId(req);
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid script review id." });
    }

    const existing = await aiService.getScriptReviewByIdForKoc(id, kocId);
    if (!existing) {
      return res.status(404).json({ message: "Script review not found." });
    }

    const inputScript = String(existing.inputScript || "").trim();
    const result = req.body.result;
    if (!inputScript) {
      return res.status(400).json({ message: "Vui lÃ²ng nháº­p ká»‹ch báº£n." });
    }
    if (!isValidScriptDoctorResult(result)) {
      return res.status(400).json({ message: "Káº¿t quáº£ Script Doctor khÃ´ng há»£p lá»‡." });
    }

    const item = await aiService.updateScriptReview(kocId, id, {
      inputScript,
      optionalFields: mapScriptOptionalFields(req.body),
      result,
    });

    if (!item) {
      return res.status(404).json({ message: "Script review not found." });
    }

    return res.json({ message: "ÄÃ£ lÆ°u káº¿t quáº£ Script Doctor.", item });
  } catch (error) {
    return next(error);
  }
}

async function reviseScriptReview(req, res, next) {
  try {
    const kocId = getUserId(req);
    const id = Number(req.params.id);
    const instruction = String(req.body.instruction || "").trim();

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid script review id." });
    }
    if (!instruction) {
      return res.status(400).json({ message: "Vui lÃ²ng nháº­p yÃªu cáº§u chá»‰nh sá»­a." });
    }

    const existing = await aiService.getScriptReviewByIdForKoc(id, kocId);
    if (!existing) {
      return res.status(404).json({ message: "Script review not found." });
    }
    if (!isValidScriptDoctorResult(existing.result)) {
      return res.status(400).json({ message: "Káº¿t quáº£ Script Doctor khÃ´ng há»£p lá»‡." });
    }

    const subscription = await kocSubscriptionService.getSubscription(kocId);
    if (subscription.used >= subscription.limit) {
      return res.status(403).json({
        message:
          "Báº¡n Ä‘Ã£ háº¿t lÆ°á»£t AI trong thÃ¡ng. NÃ¢ng cáº¥p Plus Ä‘á»ƒ nháº­n thÃªm lÆ°á»£t vÃ  Ä‘Æ°á»£c Æ°u tiÃªn hiá»ƒn thá»‹.",
      });
    }

    const result = await aiService.generateScriptDoctorRevision(
      existing.inputScript,
      existing.optionalFields,
      existing.result,
      instruction,
      { premium: subscription.plan === "plus" }
    );
    const usage = await kocSubscriptionService.consumeScriptDoctorUsage(kocId);
    const item = await aiService.updateScriptReview(kocId, id, {
      inputScript: existing.inputScript,
      optionalFields: existing.optionalFields,
      result,
    });

    return res.json({
      message: "AI Ä‘Ã£ cáº­p nháº­t Script Doctor theo yÃªu cáº§u.",
      result,
      item,
      usage: {
        plan: usage.plan,
        used: usage.used,
        limit: usage.limit,
        remaining: Math.max(0, usage.limit - usage.used),
        resetAt: usage.resetAt,
        isSearchBoosted: usage.isSearchBoosted,
      },
    });
  } catch (error) {
    if (error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    return handleAiError(error, res, next);
  }
}

function mapSmartMatchingBody(body = {}) {
  return {
    campaignId: body.campaignId ? Number(body.campaignId) : undefined,
    category: body.category ?? body.niche ?? null,
    platform: body.platform ?? null,
    budget: body.budget ?? null,
    targetFollowersMin: body.targetFollowersMin ?? body.followersMin ?? null,
    targetFollowersMax: body.targetFollowersMax ?? body.followersMax ?? null,
    targetEngagementMin: body.targetEngagementMin ?? body.engagementMin ?? null,
    description: body.description ?? body.campaignDescription ?? null,
  };
}

async function smartMatching(req, res, next) {
  try {
    const marketerId = getUserId(req);
    const campaignId = Number(req.params.campaignId);

    if (Number.isInteger(campaignId) && campaignId > 0) {
      const result = await aiService.smartMatchKocs(marketerId, { campaignId });
      return res.json(result);
    }

    const result = await aiService.smartMatchKocs(marketerId, mapSmartMatchingBody(req.body));
    return res.json(result);
  } catch (error) {
    return handleAiError(error, res, next);
  }
}

module.exports = {
  autoBrief,
  scriptDoctor,
  getQuota,
  upgradePlus,
  listMyBriefs,
  listMyScriptReviews,
  updateScriptReview,
  reviseScriptReview,
  smartMatching,
};
