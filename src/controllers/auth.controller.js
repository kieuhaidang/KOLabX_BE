const authService = require("../services/auth.service");
const { isNonEmptyString, isValidEmail, validateRole } = require("../utils/validators");

async function register(req, res, next) {
  try {
    const { fullName, email, password, role } = req.body || {};

    if (!isNonEmptyString(fullName, 100)) {
      return res.status(400).json({ message: "fullName is required and must be <= 100 characters" });
    }
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email" });
    }
    if (!isNonEmptyString(password) || password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }
    if (!validateRole(role)) {
      return res.status(400).json({ message: "role must be either marketer or koc" });
    }

    const result = await authService.registerUser({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      password,
      role,
    });

    res.cookie("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    });

    return res.status(201).json({
      message: "Register successful. Please check your email to verify your account.",
      user: result.user,
    });
  } catch (error) {
    if (error.status === 409) return res.status(409).json({ message: error.message });
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const { email, password, remember } = req.body || {};

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email" });
    }
    if (!isNonEmptyString(password)) {
      return res.status(400).json({ message: "Password is required" });
    }

    const result = await authService.loginUser({
      email: email.trim().toLowerCase(),
      password,
      remember: Boolean(remember),
    });

    res.cookie("token", result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: remember ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000, // 30 days or 1 day
    });

    return res.status(200).json({
      message: "Login successful",
      token: result.token,
      user: result.user,
    });
  } catch (error) {
    if (error.status === 401) return res.status(401).json({ message: error.message });
    next(error);
  }
}

async function verifyEmail(req, res, next) {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ message: "Token is required" });
    }

    await authService.verifyEmail(token);
    return res.status(200).json({ message: "Email verified successfully" });
  } catch (error) {
    return next(error);
  }
}

async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    await authService.requestPasswordReset(email);
    return res.status(200).json({ message: "If an account with that email exists, we have sent a reset link." });
  } catch (error) {
    return next(error);
  }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    if (!token || !isNonEmptyString(password) || password.length < 6) {
      return res.status(400).json({ message: "Token and valid password are required" });
    }

    await authService.resetPassword(token, password);
    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    return next(error);
  }
}

async function resendVerification(req, res, next) {
  try {
    const { email } = req.body;
    if (!isValidEmail(email)) {
      return res.status(400).json({ message: "Invalid email" });
    }

    await authService.resendVerificationEmail(email.trim().toLowerCase());
    return res.status(200).json({ message: "Liên kết kích hoạt đã được gửi lại. Vui lòng kiểm tra hòm thư." });
  } catch (error) {
    return next(error);
  }
}

async function logout(req, res) {
  res.clearCookie("token");
  return res.status(200).json({ message: "Logout successful" });
}

async function me(req, res, next) {
  try {
    const user = await authService.getCurrentUser(req.user.id);
    res.json({ user });
  } catch (error) {
    next(error);
  }
}

// Chỉ kiểm tra định dạng id; danh sách theme nằm ở frontend (src/theme/themes.ts),
// id không còn tồn tại sẽ được frontend tự đưa về theme mặc định.
const THEME_ID_PATTERN = /^[a-z0-9-]{1,32}$/;

async function updateTheme(req, res, next) {
  try {
    const { themeId } = req.body || {};
    if (themeId !== null && (typeof themeId !== "string" || !THEME_ID_PATTERN.test(themeId))) {
      return res.status(400).json({ message: "Theme không hợp lệ" });
    }

    const result = await authService.updateThemePreference(req.user.id, themeId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  updateTheme,
  register,
  login,
  logout,
  me,
  verifyEmail,
  forgotPassword,
  resetPassword,
  resendVerification,
};
