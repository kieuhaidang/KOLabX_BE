const profileService = require("../services/profile.service");
const { isNonEmptyString } = require("../utils/validators");

function parseBoolean(value) {
  if (value === "1" || value === "true" || value === true) return true;
  if (value === "0" || value === "false" || value === false) return false;
  return undefined;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  return parsed;
}

async function getMe(req, res, next) {
  try {
    const profile = await profileService.getMyProfile(req.user.id, req.user.role);
    if (!profile) {
      return res.status(404).json({ message: "Profile not found" });
    }
    return res.status(200).json({ profile });
  } catch (error) {
    return next(error);
  }
}

async function updatePassword(req, res, next) {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body || {};

    if (!isNonEmptyString(currentPassword)) {
      return res.status(400).json({ message: "currentPassword is required" });
    }
    if (!isNonEmptyString(newPassword) || newPassword.length < 6) {
      return res.status(400).json({ message: "newPassword must be at least 6 characters" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: "newPassword and confirmPassword must match" });
    }

    await profileService.changePassword(req.user.id, currentPassword, newPassword);

    return res.status(200).json({ message: "Đổi mật khẩu thành công" });
  } catch (error) {
    return next(error);
  }
}

async function updateMe(req, res, next) {
  try {
    const role = req.user.role;
    const payload = req.body || {};
    const current = await profileService.getMyProfile(req.user.id, role);
    if (!current) {
      return res.status(404).json({ message: "Profile not found" });
    }

    if (payload.fullName !== undefined && !isNonEmptyString(payload.fullName, 100)) {
      return res.status(400).json({ message: "fullName must be a non-empty string <= 100 characters" });
    }

    const safePayload = {
      fullName: payload.fullName?.trim() ?? current.fullName,
    };

    if (role === "marketer") {
      safePayload.companyName = payload.companyName ?? current.companyName;
      safePayload.brandName = payload.brandName ?? current.brandName;
      safePayload.industry = payload.industry ?? current.industry;
      safePayload.bio = payload.bio ?? current.bio;
      safePayload.website = payload.website ?? current.website;
      safePayload.avatarUrl = payload.avatarUrl ?? current.avatarUrl;
      safePayload.bankName = payload.bankName ?? current.bankName;
      safePayload.bankAccountNumber = payload.bankAccountNumber ?? current.bankAccountNumber;
      safePayload.bankAccountName = payload.bankAccountName ?? current.bankAccountName;
    } else if (role === "koc") {
      safePayload.displayName = payload.displayName ?? current.displayName;
      safePayload.niche = payload.niche ?? current.niche;
      safePayload.platform = payload.platform ?? current.platform;
      safePayload.followers = parseNumber(payload.followers) ?? current.followers ?? 0;
      safePayload.engagementRate = parseNumber(payload.engagementRate) ?? current.engagementRate ?? 0;
      safePayload.servicePrice = parseNumber(payload.servicePrice) ?? current.servicePrice ?? 0;
      safePayload.verified = parseBoolean(payload.verified) ?? current.verified ?? false;
      safePayload.bio = payload.bio ?? current.bio;
      safePayload.location = payload.location ?? current.location;
      safePayload.avatarUrl = payload.avatarUrl ?? current.avatarUrl;
      safePayload.bankName = payload.bankName ?? current.bankName;
      safePayload.bankAccountNumber = payload.bankAccountNumber ?? current.bankAccountNumber;
      safePayload.bankAccountName = payload.bankAccountName ?? current.bankAccountName;
    } else {
      return res.status(403).json({ message: "Unsupported role" });
    }

    const profile = await profileService.updateMyProfile(req.user.id, role, safePayload);
    return res.status(200).json({
      message: "Profile updated successfully",
      profile,
    });
  } catch (error) {
    return next(error);
  }
}

async function listKocs(req, res, next) {
  try {
    const profiles = await profileService.listKocProfiles({
      search: req.query.search?.trim(),
      niche: req.query.niche?.trim(),
      platform: req.query.platform?.trim(),
      verified: parseBoolean(req.query.verified),
      minFollowers: parseNumber(req.query.minFollowers),
      maxPrice: parseNumber(req.query.maxPrice),
      sort: req.query.sort?.trim(),
    });
    return res.status(200).json({ items: profiles });
  } catch (error) {
    return next(error);
  }
}

async function getKocById(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid koc id" });
    }

    const profile = await profileService.getKocProfileById(id);
    if (!profile) {
      return res.status(404).json({ message: "KOC profile not found" });
    }

    return res.status(200).json({ profile });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getMe,
  updateMe,
  updatePassword,
  listKocs,
  getKocById,
};
