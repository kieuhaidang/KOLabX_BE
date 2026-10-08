const { pool } = require("../config/db");
const { GoogleGenAI } = require("@google/genai");

const AI_UNAVAILABLE_CODE = "AI_SERVICE_UNAVAILABLE";
const AI_UNAVAILABLE_MESSAGE = "Dịch vụ AI hiện không khả dụng. Vui lòng thử lại sau.";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || process.env.AI_REQUEST_TIMEOUT_MS || 60000);
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const AI_ERROR_CODES = {
  CONFIG: "AI_CONFIG_ERROR",
  AUTH: "AI_AUTH_ERROR",
  RATE_LIMIT: "AI_RATE_LIMIT",
  TIMEOUT: "AI_TIMEOUT",
  EMPTY_RESPONSE: "AI_EMPTY_RESPONSE",
  INVALID_RESPONSE: "AI_INVALID_RESPONSE",
  PROVIDER: "AI_PROVIDER_ERROR",
};

const briefResultKeys = [
  "campaignTitle",
  "objectives",
  "targetAudience",
  "contentDirection",
  "keyMessages",
  "suggestedKocProfile",
  "cta",
  "hashtags",
  "deliverables",
  "timeline",
  "budgetSuggestion",
];

const scriptResultKeys = [
  "improvedHook",
  "improvedScript",
  "strongerCTA",
  "contentTips",
  "platformOptimization",
  "hashtagSuggestions",
];

const smartMatchingItemKeys = ["id", "userId", "name", "score", "reasons"];

class AiServiceUnavailableError extends Error {
  constructor(reason, details = {}) {
    super(AI_UNAVAILABLE_MESSAGE);
    this.name = "AiServiceUnavailableError";
    this.status = 503;
    this.code = AI_UNAVAILABLE_CODE;
    this.reason = reason;
    this.details = details;
  }
}

function logAiFailure(reason, details = {}) {
  const safeDetails = {
    provider: details.provider,
    model: details.model,
    status: details.status,
    code: details.code,
    operation: details.operation,
    message: details.message,
  };
  console.error("[ai] service unavailable", { reason, ...safeDetails });
}

function parseJsonSafe(value) {
  if (value && typeof value === "object") return value;
  if (!value || typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractFirstJsonValue(text) {
  if (!text || typeof text !== "string") return null;
  const objectStart = text.indexOf("{");
  const arrayStart = text.indexOf("[");
  const starts = [objectStart, arrayStart].filter((index) => index >= 0);
  if (starts.length === 0) return null;

  const start = Math.min(...starts);
  const openingChar = text[start];
  const closingChar = openingChar === "{" ? "}" : "]";
  const end = text.lastIndexOf(closingChar);
  if (start < 0 || end <= start) return null;
  return parseJsonSafe(text.slice(start, end + 1));
}

function cleanJsonText(text) {
  if (!text || typeof text !== "string") return null;
  let normalized = text.trim();
  normalized = normalized.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  normalized = normalized.replace(/\s*```$/i, "").trim();
  return parseJsonSafe(normalized) || extractFirstJsonValue(normalized);
}

function ensureArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return value
      .split(/\n|,|\|/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function requireNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function requireNonEmptyArray(value) {
  return Array.isArray(value) && value.some((item) => String(item || "").trim());
}

function validateRequiredFields(result, validators, operation) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new AiServiceUnavailableError("malformed_ai_response", { operation });
  }

  const invalidKey = Object.entries(validators).find(([key, validator]) => !validator(result[key]))?.[0];
  if (invalidKey) {
    throw new AiServiceUnavailableError("invalid_ai_response", {
      operation,
      message: `Missing or empty field: ${invalidKey}`,
    });
  }
}

function normalizeBriefResult(raw) {
  validateRequiredFields(
    raw,
    {
      campaignTitle: requireNonEmptyString,
      objectives: requireNonEmptyArray,
      targetAudience: requireNonEmptyString,
      contentDirection: requireNonEmptyArray,
      keyMessages: requireNonEmptyArray,
      suggestedKocProfile: requireNonEmptyArray,
      cta: requireNonEmptyString,
      hashtags: requireNonEmptyArray,
      deliverables: requireNonEmptyArray,
      timeline: requireNonEmptyString,
      budgetSuggestion: requireNonEmptyString,
    },
    "auto_brief"
  );

  return {
    campaignTitle: String(raw.campaignTitle).trim(),
    objectives: ensureArray(raw.objectives),
    targetAudience: String(raw.targetAudience).trim(),
    contentDirection: ensureArray(raw.contentDirection),
    keyMessages: ensureArray(raw.keyMessages),
    suggestedKocProfile: ensureArray(raw.suggestedKocProfile),
    cta: String(raw.cta).trim(),
    hashtags: ensureArray(raw.hashtags),
    deliverables: ensureArray(raw.deliverables),
    timeline: String(raw.timeline).trim(),
    budgetSuggestion: String(raw.budgetSuggestion).trim(),
  };
}

function normalizeScriptResult(raw) {
  validateRequiredFields(
    raw,
    {
      improvedHook: requireNonEmptyString,
      improvedScript: requireNonEmptyString,
      strongerCTA: requireNonEmptyString,
      contentTips: requireNonEmptyArray,
      platformOptimization: requireNonEmptyArray,
      hashtagSuggestions: requireNonEmptyArray,
    },
    "script_doctor"
  );

  return {
    improvedHook: String(raw.improvedHook).trim(),
    improvedScript: String(raw.improvedScript).trim(),
    strongerCTA: String(raw.strongerCTA).trim(),
    contentTips: ensureArray(raw.contentTips),
    platformOptimization: ensureArray(raw.platformOptimization),
    hashtagSuggestions: ensureArray(raw.hashtagSuggestions),
  };
}

function tryNormalizeBriefResult(raw) {
  try {
    return raw ? normalizeBriefResult(raw) : null;
  } catch {
    return null;
  }
}

function tryNormalizeScriptResult(raw) {
  try {
    return raw ? normalizeScriptResult(raw) : null;
  } catch {
    return null;
  }
}

function normalizeSmartMatchingResult(raw, candidatesByUserId) {
  validateRequiredFields(
    raw,
    {
      items: (value) => Array.isArray(value),
    },
    "smart_matching"
  );

  const items = raw.items.map((item) => {
    validateRequiredFields(
      item,
      {
        userId: (value) => Number.isInteger(Number(value)) && candidatesByUserId.has(Number(value)),
        score: (value) => Number.isFinite(Number(value)),
        reasons: requireNonEmptyArray,
      },
      "smart_matching"
    );

    const candidate = candidatesByUserId.get(Number(item.userId));
    return {
      id: candidate.id,
      userId: candidate.user_id,
      name: candidate.display_name || candidate.full_name,
      email: candidate.email,
      niche: candidate.niche,
      category: candidate.category || candidate.niche,
      platform: candidate.platform,
      followers: Number(candidate.followers || 0),
      engagementRate: Number(candidate.engagement_rate || 0),
      plan: candidate.plan === "plus" ? "plus" : "free",
      isSearchBoosted: Boolean(candidate.is_search_boosted),
      score: Math.max(0, Math.min(100, Number(item.score))),
      reasons: ensureArray(item.reasons),
    };
  });

  return items
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function mapBriefRow(row) {
  const optionalFields = parseJsonSafe(row.optional_fields) || {
    brand: null,
    product: row.product_name ?? null,
    platform: row.platform ?? null,
    targetAudience: null,
    budget: null,
  };
  const parsedResult = parseJsonSafe(row.result) || parseJsonSafe(row.generated_brief);

  return {
    id: row.id,
    marketerId: row.marketer_id,
    inputText: row.input_text,
    optionalFields,
    result: tryNormalizeBriefResult(parsedResult),
    createdAt: row.created_at,
  };
}

function mapScriptReviewRow(row) {
  const optionalFields = parseJsonSafe(row.optional_fields) || {
    platform: null,
    tone: null,
    product: null,
    targetAudience: null,
  };
  const parsedResult = parseJsonSafe(row.result);

  return {
    id: row.id,
    kocId: row.koc_id,
    inputScript: row.script_text || row.input_script,
    optionalFields,
    result: tryNormalizeScriptResult(parsedResult),
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at,
  };
}

let aiBriefHasJsonColumns;
let scriptReviewsHasJsonColumns;
let aiBriefColumnsCache;
let scriptReviewsColumnsCache;

async function tableHasColumns(table, expectedColumns) {
  const [rows] = await pool.query(`SHOW COLUMNS FROM ${table}`);
  const names = new Set(rows.map((row) => row.Field));
  return expectedColumns.every((column) => names.has(column));
}

async function hasJsonColumnsForBriefs() {
  if (aiBriefHasJsonColumns === undefined) {
    aiBriefHasJsonColumns = await tableHasColumns("ai_briefs", ["optional_fields", "result"]);
  }
  return aiBriefHasJsonColumns;
}

async function hasJsonColumnsForScriptReviews() {
  if (scriptReviewsHasJsonColumns === undefined) {
    scriptReviewsHasJsonColumns = await tableHasColumns("script_reviews", ["optional_fields", "result"]);
  }
  return scriptReviewsHasJsonColumns;
}

async function getAiBriefColumns() {
  if (!aiBriefColumnsCache) {
    const [rows] = await pool.query("SHOW COLUMNS FROM ai_briefs");
    aiBriefColumnsCache = new Set(rows.map((row) => row.Field));
  }
  return aiBriefColumnsCache;
}

async function getScriptReviewColumns() {
  if (!scriptReviewsColumnsCache) {
    const [rows] = await pool.query("SHOW COLUMNS FROM script_reviews");
    scriptReviewsColumnsCache = new Set(rows.map((row) => row.Field));
  }
  return scriptReviewsColumnsCache;
}

async function saveAutoBrief(marketerId, payload) {
  const useJsonColumns = await hasJsonColumnsForBriefs();
  if (useJsonColumns) {
    const [result] = await pool.query(
      `INSERT INTO ai_briefs (marketer_id, input_text, optional_fields, result)
       VALUES (?, ?, ?, ?)`,
      [marketerId, payload.inputText, JSON.stringify(payload.optionalFields || {}), JSON.stringify(payload.result || {})]
    );
    return result.insertId;
  }

  const [result] = await pool.query(
    `INSERT INTO ai_briefs (
      marketer_id, product_name, input_text, generated_brief, category, platform, suggested_kpi
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      marketerId,
      payload.optionalFields?.product ?? null,
      payload.inputText,
      JSON.stringify(payload.result || {}),
      payload.optionalFields?.brand ?? null,
      payload.optionalFields?.platform ?? null,
      ensureArray(payload.result?.objectives).join(" | "),
    ]
  );
  return result.insertId;
}

async function saveScriptDoctor(kocId, payload) {
  const scriptText = [payload.inputScript, payload.scriptText, payload.script, payload.originalScript]
    .find((value) => String(value || "").trim());
  const normalizedScriptText = String(scriptText || "").trim();
  if (!normalizedScriptText) {
    throw new Error("script_text is required");
  }

  const useJsonColumns = await hasJsonColumnsForScriptReviews();
  if (useJsonColumns) {
    const [result] = await pool.query(
      `INSERT INTO script_reviews (koc_id, script_text, input_script, optional_fields, result)
       VALUES (?, ?, ?, ?, ?)`,
      [
        kocId,
        normalizedScriptText,
        normalizedScriptText,
        JSON.stringify(payload.optionalFields || {}),
        JSON.stringify(payload.result || {}),
      ]
    );
    return result.insertId;
  }

  const [result] = await pool.query(
    `INSERT INTO script_reviews (
      koc_id, script_text, viral_score, engagement_score, policy_warning, rewrite_suggestion
    ) VALUES (?, ?, ?, ?, ?, ?)`,
    [
      kocId,
      normalizedScriptText,
      null,
      null,
      ensureArray(payload.result?.contentTips).join(" | "),
      payload.result?.improvedScript || null,
    ]
  );
  return result.insertId;
}

async function updateScriptReview(kocId, id, payload) {
  const columns = await getScriptReviewColumns();
  const updates = [];
  const values = [];

  if (columns.has("optional_fields")) {
    updates.push("optional_fields = ?");
    values.push(JSON.stringify(payload.optionalFields || {}));
  }

  if (columns.has("result")) {
    updates.push("result = ?");
    values.push(JSON.stringify(payload.result || {}));
  }

  if (columns.has("policy_warning")) {
    updates.push("policy_warning = ?");
    values.push(ensureArray(payload.result?.contentTips).join(" | "));
  }

  if (columns.has("rewrite_suggestion")) {
    updates.push("rewrite_suggestion = ?");
    values.push(payload.result?.improvedScript || null);
  }

  if (columns.has("updated_at")) {
    updates.push("updated_at = CURRENT_TIMESTAMP");
  }

  if (updates.length === 0) return null;

  values.push(id, kocId);
  const [result] = await pool.query(
    `UPDATE script_reviews
     SET ${updates.join(", ")}
     WHERE id = ? AND koc_id = ?`,
    values
  );

  if (!result.affectedRows) return null;
  return getScriptReviewByIdForKoc(id, kocId);
}

async function getBriefById(id) {
  const columns = await getAiBriefColumns();
  const selectFields = [
    "id",
    "marketer_id",
    columns.has("product_name") ? "product_name" : "NULL AS product_name",
    "input_text",
    columns.has("generated_brief") ? "generated_brief" : "NULL AS generated_brief",
    columns.has("category") ? "category" : "NULL AS category",
    columns.has("platform") ? "platform" : "NULL AS platform",
    columns.has("suggested_kpi") ? "suggested_kpi" : "NULL AS suggested_kpi",
    columns.has("optional_fields") ? "optional_fields" : "NULL AS optional_fields",
    columns.has("result") ? "result" : "NULL AS result",
    "created_at",
  ];
  const [rows] = await pool.query(
    `SELECT ${selectFields.join(", ")}
     FROM ai_briefs
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ? mapBriefRow(rows[0]) : null;
}

async function getScriptReviewById(id) {
  const columns = await getScriptReviewColumns();
  const selectFields = [
    "id",
    "koc_id",
    columns.has("script_text") ? "script_text" : "NULL AS script_text",
    columns.has("input_script") ? "input_script" : "NULL AS input_script",
    columns.has("optional_fields") ? "optional_fields" : "NULL AS optional_fields",
    columns.has("result") ? "result" : "NULL AS result",
    "created_at",
    columns.has("updated_at") ? "updated_at" : "created_at AS updated_at",
  ];
  const [rows] = await pool.query(
    `SELECT ${selectFields.join(", ")}
     FROM script_reviews
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] ? mapScriptReviewRow(rows[0]) : null;
}

async function getScriptReviewByIdForKoc(id, kocId) {
  const columns = await getScriptReviewColumns();
  const selectFields = [
    "id",
    "koc_id",
    columns.has("script_text") ? "script_text" : "NULL AS script_text",
    columns.has("input_script") ? "input_script" : "NULL AS input_script",
    columns.has("optional_fields") ? "optional_fields" : "NULL AS optional_fields",
    columns.has("result") ? "result" : "NULL AS result",
    "created_at",
    columns.has("updated_at") ? "updated_at" : "created_at AS updated_at",
  ];
  const [rows] = await pool.query(
    `SELECT ${selectFields.join(", ")}
     FROM script_reviews
     WHERE id = ? AND koc_id = ?
     LIMIT 1`,
    [id, kocId]
  );
  return rows[0] ? mapScriptReviewRow(rows[0]) : null;
}

async function listBriefsByMarketerId(marketerId) {
  const columns = await getAiBriefColumns();
  const selectFields = [
    "id",
    "marketer_id",
    columns.has("product_name") ? "product_name" : "NULL AS product_name",
    "input_text",
    columns.has("generated_brief") ? "generated_brief" : "NULL AS generated_brief",
    columns.has("category") ? "category" : "NULL AS category",
    columns.has("platform") ? "platform" : "NULL AS platform",
    columns.has("suggested_kpi") ? "suggested_kpi" : "NULL AS suggested_kpi",
    columns.has("optional_fields") ? "optional_fields" : "NULL AS optional_fields",
    columns.has("result") ? "result" : "NULL AS result",
    "created_at",
  ];
  const [rows] = await pool.query(
    `SELECT ${selectFields.join(", ")}
     FROM ai_briefs
     WHERE marketer_id = ?
     ORDER BY created_at DESC`,
    [marketerId]
  );
  return rows.map(mapBriefRow).filter((item) => item.result);
}

async function listScriptReviewsByKocId(kocId) {
  const columns = await getScriptReviewColumns();
  const selectFields = [
    "id",
    "koc_id",
    columns.has("script_text") ? "script_text" : "NULL AS script_text",
    columns.has("input_script") ? "input_script" : "NULL AS input_script",
    columns.has("optional_fields") ? "optional_fields" : "NULL AS optional_fields",
    columns.has("result") ? "result" : "NULL AS result",
    "created_at",
    columns.has("updated_at") ? "updated_at" : "created_at AS updated_at",
  ];
  const [rows] = await pool.query(
    `SELECT ${selectFields.join(", ")}
     FROM script_reviews
     WHERE koc_id = ?
     ORDER BY ${columns.has("updated_at") ? "updated_at" : "created_at"} DESC
     LIMIT 20`,
    [kocId]
  );
  return rows.map(mapScriptReviewRow).filter((item) => item.result);
}

function normalizeProviderError(error, context = {}) {
  if (error instanceof AiServiceUnavailableError) return error;

  const status = Number(error?.status || error?.statusCode || error?.code);
  const message = String(error?.message || "");
  const lowerMessage = message.toLowerCase();

  if (error?.name === "AbortError" || error?.code === "ETIMEDOUT" || lowerMessage.includes("timeout")) {
    return new AiServiceUnavailableError(AI_ERROR_CODES.TIMEOUT, {
      ...context,
      status: Number.isFinite(status) ? status : undefined,
      code: AI_ERROR_CODES.TIMEOUT,
      message: "AI request timed out",
    });
  }

  if (status === 401 || status === 403 || lowerMessage.includes("api key") || lowerMessage.includes("unauthorized")) {
    return new AiServiceUnavailableError(AI_ERROR_CODES.AUTH, {
      ...context,
      status,
      code: AI_ERROR_CODES.AUTH,
      message: "AI authentication failed",
    });
  }

  if (status === 429 || lowerMessage.includes("rate limit") || lowerMessage.includes("quota")) {
    return new AiServiceUnavailableError(AI_ERROR_CODES.RATE_LIMIT, {
      ...context,
      status,
      code: AI_ERROR_CODES.RATE_LIMIT,
      message: "AI rate limit or quota reached",
    });
  }

  return new AiServiceUnavailableError(AI_ERROR_CODES.PROVIDER, {
    ...context,
    status: Number.isFinite(status) ? status : undefined,
    code: AI_ERROR_CODES.PROVIDER,
    message: "AI provider request failed",
  });
}

function getProviderName() {
  return String(process.env.AI_PROVIDER || "openrouter").trim().toLowerCase();
}

function getOpenRouterConfig() {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  const model = String(process.env.OPENROUTER_MODEL || "").trim();

  if (!apiKey) {
    throw new AiServiceUnavailableError(AI_ERROR_CODES.CONFIG, {
      provider: "openrouter",
      code: AI_ERROR_CODES.CONFIG,
      message: "OPENROUTER_API_KEY is required",
    });
  }

  if (!model) {
    throw new AiServiceUnavailableError(AI_ERROR_CODES.CONFIG, {
      provider: "openrouter",
      code: AI_ERROR_CODES.CONFIG,
      message: "OPENROUTER_MODEL is required",
    });
  }

  if (typeof fetch !== "function" || typeof AbortController !== "function") {
    throw new AiServiceUnavailableError(AI_ERROR_CODES.CONFIG, {
      provider: "openrouter",
      model,
      code: AI_ERROR_CODES.CONFIG,
      message: "Fetch or AbortController is unavailable",
    });
  }

  return { apiKey, model, provider: "openrouter" };
}

let geminiClient;

function getGeminiConfig() {
  const apiKey = String(process.env.GEMINI_API_KEY || "").trim();
  const model = String(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL).trim() || DEFAULT_GEMINI_MODEL;

  if (!apiKey) {
    throw new AiServiceUnavailableError(AI_ERROR_CODES.CONFIG, {
      provider: "gemini",
      model,
      code: AI_ERROR_CODES.CONFIG,
      message: "GEMINI_API_KEY is required",
    });
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }

  return { client: geminiClient, model, provider: "gemini" };
}

function assertAiText(text, context) {
  if (typeof text !== "string" || !text.trim()) {
    throw new AiServiceUnavailableError(AI_ERROR_CODES.EMPTY_RESPONSE, {
      ...context,
      code: AI_ERROR_CODES.EMPTY_RESPONSE,
      message: "AI provider returned an empty response",
    });
  }

  return text.trim();
}

function withTimeout(promise, timeoutMs, context) {
  let timeout;
  const timeoutPromise = new Promise((_, reject) => {
    timeout = setTimeout(() => {
      reject(new AiServiceUnavailableError(AI_ERROR_CODES.TIMEOUT, {
        ...context,
        code: AI_ERROR_CODES.TIMEOUT,
        message: "AI request timed out",
      }));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeout));
}

async function generateWithOpenRouter(options) {
  const config = getOpenRouterConfig();
  const context = { provider: config.provider, model: config.model, operation: options.operation };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const body = {
      model: config.model,
      messages: [
        { role: "system", content: options.systemPrompt },
        { role: "user", content: options.userPrompt },
      ],
      temperature: options.temperature ?? 0.3,
    };

    if (options.maxOutputTokens) {
      body.max_tokens = options.maxOutputTokens;
    }

    if (options.responseFormat === "json") {
      body.response_format = { type: "json_object" };
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.FRONTEND_URL || "http://localhost:5000",
        "X-Title": "KOLab",
      },
      body: JSON.stringify(body),
    });

    const rawText = await response.text();
    if (!response.ok) {
      throw new AiServiceUnavailableError(
        response.status === 401 || response.status === 403
          ? AI_ERROR_CODES.AUTH
          : response.status === 429
            ? AI_ERROR_CODES.RATE_LIMIT
            : AI_ERROR_CODES.PROVIDER,
        {
          ...context,
          status: response.status,
          code: response.status === 401 || response.status === 403
            ? AI_ERROR_CODES.AUTH
            : response.status === 429
              ? AI_ERROR_CODES.RATE_LIMIT
              : AI_ERROR_CODES.PROVIDER,
          message: "OpenRouter request failed",
        }
      );
    }

    const data = parseJsonSafe(rawText);
    if (!data) {
      throw new AiServiceUnavailableError(AI_ERROR_CODES.INVALID_RESPONSE, {
        ...context,
        code: AI_ERROR_CODES.INVALID_RESPONSE,
        message: "OpenRouter returned malformed JSON",
      });
    }

    return {
      text: assertAiText(data?.choices?.[0]?.message?.content, context),
      provider: config.provider,
      model: config.model,
    };
  } catch (error) {
    throw normalizeProviderError(error, context);
  } finally {
    clearTimeout(timeout);
  }
}

async function generateWithGemini(options) {
  const config = getGeminiConfig();
  const context = { provider: config.provider, model: config.model, operation: options.operation };

  try {
    const request = {
      model: config.model,
      contents: options.userPrompt,
      config: {
        systemInstruction: options.systemPrompt,
        temperature: options.temperature ?? 0.3,
      },
    };

    if (options.maxOutputTokens) {
      request.config.maxOutputTokens = options.maxOutputTokens;
    }

    if (options.responseFormat === "json") {
      request.config.responseMimeType = "application/json";
    }

    const response = await withTimeout(
      config.client.models.generateContent(request),
      AI_TIMEOUT_MS,
      context
    );
    const text = typeof response?.text === "function" ? response.text() : response?.text;

    return {
      text: assertAiText(text, context),
      provider: config.provider,
      model: config.model,
    };
  } catch (error) {
    throw normalizeProviderError(error, context);
  }
}

async function generateAIContent(options) {
  const provider = getProviderName();

  switch (provider) {
    case "openrouter":
      return generateWithOpenRouter(options);
    case "gemini":
      return generateWithGemini(options);
    default:
      throw new AiServiceUnavailableError(AI_ERROR_CODES.CONFIG, {
        provider: provider || "missing",
        operation: options.operation,
        code: AI_ERROR_CODES.CONFIG,
        message: `Unsupported AI provider: ${provider}`,
      });
  }
}

async function callAIJson(systemPrompt, userPrompt, operation, options = {}) {
  const response = await generateAIContent({
    systemPrompt,
    userPrompt,
    operation,
    responseFormat: "json",
    temperature: 0.3,
    maxOutputTokens: options.maxOutputTokens,
  });
  const parsedContent = cleanJsonText(response.text);

  if (!parsedContent) {
    throw new AiServiceUnavailableError(AI_ERROR_CODES.INVALID_RESPONSE, {
      provider: response.provider,
      model: response.model,
      operation,
      code: AI_ERROR_CODES.INVALID_RESPONSE,
      message: "AI returned malformed JSON content",
    });
  }

  return parsedContent;
}

async function generateAutoBrief(inputText, optionalFields = {}, options = {}) {
  const systemPrompt = [
    "You are a senior campaign strategist for influencer marketing.",
    "Generate a campaign brief that adapts to provided input context.",
    "All output values must be written in Vietnamese with proper accents.",
    "Return ONLY valid JSON. No markdown. No explanation. No code fences.",
    "Return ONLY JSON with keys:",
    "campaignTitle, objectives(array), targetAudience, contentDirection(array), keyMessages(array), suggestedKocProfile(array), cta, hashtags(array), deliverables(array), timeline, budgetSuggestion.",
  ].join(" ");

  const userPrompt = JSON.stringify({
    campaignIdea: inputText,
    brand: optionalFields.brand || null,
    product: optionalFields.product || null,
    platform: optionalFields.platform || null,
    targetAudience: optionalFields.targetAudience || null,
    budget: optionalFields.budget || null,
    requiredKeys: briefResultKeys,
  });

  const result = await callAIJson(systemPrompt, userPrompt, "auto_brief", options);
  return normalizeBriefResult(result);
}

async function generateScriptDoctor(inputScript, optionalFields = {}, options = {}) {
  const systemPrompt = [
    "You are a social content script doctor.",
    "All output values must be written in Vietnamese with proper accents.",
    "Return ONLY valid JSON. No markdown. No explanation. No code fences.",
    "Return ONLY JSON with keys: improvedHook, improvedScript, strongerCTA, contentTips(array), platformOptimization(array), hashtagSuggestions(array).",
    options.premium ? "Add deeper, premium-level suggestions and more actionable platform optimization." : "",
  ].join(" ");

  const userPrompt = JSON.stringify({
    rawScript: inputScript,
    platform: optionalFields.platform || null,
    tone: optionalFields.tone || null,
    product: optionalFields.product || null,
    targetAudience: optionalFields.targetAudience || null,
    requiredKeys: scriptResultKeys,
  });

  const result = await callAIJson(systemPrompt, userPrompt, "script_doctor", options);
  return normalizeScriptResult(result);
}

async function generateScriptDoctorRevision(inputScript, optionalFields = {}, currentResult, instruction, options = {}) {
  const systemPrompt = [
    "You are a social content script doctor.",
    "All output values must be written in Vietnamese with proper accents.",
    "Revise the current script-doctor result according to the user's instruction.",
    "Return the complete revised result, not a partial patch.",
    "Return ONLY valid JSON. No markdown. No explanation. No code fences.",
    "Return ONLY JSON with keys: improvedHook, improvedScript, strongerCTA, contentTips(array), platformOptimization(array), hashtagSuggestions(array).",
    options.premium ? "Add deeper, premium-level suggestions and more actionable platform optimization." : "",
  ].join(" ");

  const userPrompt = JSON.stringify({
    originalScript: inputScript,
    optionalFields: {
      platform: optionalFields.platform || null,
      tone: optionalFields.tone || null,
      product: optionalFields.product || null,
      targetAudience: optionalFields.targetAudience || null,
    },
    currentResult,
    revisionInstruction: instruction,
    requiredKeys: scriptResultKeys,
  });

  const result = await callAIJson(systemPrompt, userPrompt, "script_doctor_revision");
  return normalizeScriptResult(result);
}

function buildMatchingCriteria(input = {}, campaign = null) {
  return {
    campaignId: campaign?.id ?? (input.campaignId ? Number(input.campaignId) : null),
    campaignTitle: input.campaignTitle ?? campaign?.title ?? null,
    campaignDescription: input.campaignDescription ?? input.description ?? campaign?.description ?? null,
    category: input.category ?? input.niche ?? campaign?.category ?? null,
    niche: input.niche ?? input.category ?? campaign?.category ?? null,
    platform: input.platform ?? campaign?.platform ?? null,
    targetAudience: input.targetAudience ?? null,
    budget: Number(input.budget ?? campaign?.budget ?? 0) || 0,
    targetFollowersMin: Number(input.targetFollowersMin ?? campaign?.targetFollowersMin ?? 0) || 0,
    targetFollowersMax: Number(input.targetFollowersMax ?? campaign?.targetFollowersMax ?? 0) || 0,
    targetEngagementMin: Number(input.targetEngagementMin ?? campaign?.targetEngagementMin ?? 0) || 0,
    brief: input.brief ?? null,
  };
}

async function getCampaignForMatching(marketerId, campaignId) {
  const [rows] = await pool.query(
    `SELECT id, title, category, platform, budget, target_followers_min, target_followers_max, target_engagement_min, description
     FROM campaigns
     WHERE id = ? AND marketer_id = ? AND status IN ('open', 'scheduled')
     LIMIT 1`,
    [campaignId, marketerId]
  );
  if (!rows[0]) return null;
  const row = rows[0];
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    platform: row.platform,
    budget: Number(row.budget || 0),
    targetFollowersMin: Number(row.target_followers_min || 0),
    targetFollowersMax: Number(row.target_followers_max || 0),
    targetEngagementMin: Number(row.target_engagement_min || 0),
    description: row.description,
  };
}

async function listKocsForMatching() {
  const [rows] = await pool.query(
    `SELECT
      u.id AS user_id,
      u.full_name,
      u.email,
      kp.id,
      kp.display_name,
      kp.niche,
      kp.niche AS category,
      kp.platform,
      kp.followers,
      kp.engagement_rate,
      kp.bio,
      kp.location,
      kp.bio AS content_style,
      COALESCE(kp.plan, 'free') AS plan,
      COALESCE(kp.is_search_boosted, 0) AS is_search_boosted
    FROM users u
    INNER JOIN koc_profiles kp ON kp.user_id = u.id
    WHERE u.role = 'koc'
      AND u.status = 'active'`
  );
  return rows;
}

async function smartMatchKocs(marketerId, input = {}) {
  let campaign = null;
  if (input.campaignId) {
    campaign = await getCampaignForMatching(marketerId, Number(input.campaignId));
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.status = 404;
      throw error;
    }
  }

  const criteria = buildMatchingCriteria(input, campaign);
  const candidates = await listKocsForMatching();
  const candidatesByUserId = new Map(candidates.map((candidate) => [Number(candidate.user_id), candidate]));

  const systemPrompt = [
    "You are an influencer marketing matching analyst.",
    "Rank real KOC candidates for the campaign using only the provided candidates.",
    "Do not invent KOCs, IDs, metrics, names, or reasons.",
    "All reason text must be written in Vietnamese with proper accents.",
    "Return ONLY valid JSON. No markdown. No explanation. No code fences.",
    "Return JSON with key items(array). Each item must include userId(number), score(number 0-100), reasons(array).",
  ].join(" ");

  const userPrompt = JSON.stringify({
    campaign: criteria,
    candidates: candidates.map((candidate) => ({
      userId: candidate.user_id,
      name: candidate.display_name || candidate.full_name,
      niche: candidate.niche,
      platform: candidate.platform,
      followers: Number(candidate.followers || 0),
      engagementRate: Number(candidate.engagement_rate || 0),
      bio: candidate.bio,
      location: candidate.location,
      plan: candidate.plan,
      isSearchBoosted: Boolean(candidate.is_search_boosted),
    })),
    requiredKeys: smartMatchingItemKeys,
  });

  const result = await callAIJson(systemPrompt, userPrompt, "smart_matching");
  const items = normalizeSmartMatchingResult(result, candidatesByUserId);
  return { campaign: criteria, items };
}

async function generateSmartMatching(marketerId, input = {}) {
  const result = await smartMatchKocs(marketerId, input);
  return result.items;
}

module.exports = {
  AI_UNAVAILABLE_CODE,
  AI_UNAVAILABLE_MESSAGE,
  AiServiceUnavailableError,
  briefResultKeys,
  scriptResultKeys,
  generateAutoBrief,
  generateScriptDoctor,
  generateScriptDoctorRevision,
  saveAutoBrief,
  saveScriptDoctor,
  updateScriptReview,
  getBriefById,
  getScriptReviewById,
  getScriptReviewByIdForKoc,
  listBriefsByMarketerId,
  listScriptReviewsByKocId,
  smartMatchKocs,
  generateSmartMatching,
  logAiFailure,
};
