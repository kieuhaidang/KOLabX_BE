const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { pool } = require("../config/db");
const { signAccessToken } = require("../utils/jwt");
const mailService = require("./mail.service");

async function findUserByEmail(email) {
  const [rows] = await pool.query(
    "SELECT id, full_name, email, password_hash, role, is_verified, status FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  return rows[0] || null;
}

async function findUserById(id) {
  const [rows] = await pool.query(
    "SELECT id, full_name, email, role, is_verified FROM users WHERE id = ? LIMIT 1",
    [id]
  );
  return rows[0] || null;
}

async function createRoleProfile(connection, userId, role) {
  if (role === "marketer") {
    await connection.query("INSERT INTO marketer_profiles (user_id) VALUES (?)", [userId]);
  } else if (role === "koc") {
    await connection.query("INSERT INTO koc_profiles (user_id, display_name) VALUES (?, ?)", [userId, ""]);
  }
}

async function registerUser({ fullName, email, password, role }) {
  const existing = await findUserByEmail(email);
  if (existing) {
    const error = new Error("Email already exists");
    error.status = 409;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [insertResult] = await connection.query(
      "INSERT INTO users (full_name, email, password_hash, role, status, verification_token) VALUES (?, ?, ?, ?, 'active', ?)",
      [fullName, email, hashedPassword, role, verificationToken]
    );

    const userId = insertResult.insertId;
    await createRoleProfile(connection, userId, role);

    await connection.commit();

    // Send email in background - DO NOT AWAIT to keep UI snappy
    mailService.sendVerificationEmail(email, verificationToken).catch(err => {
      console.error("Background error sending verification email:", err);
    });

    const user = {
      id: userId,
      fullName,
      email,
      role,
      isVerified: false,
    };

    // User must verify before they get a token
    return { user };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function verifyEmail(token) {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE verification_token = ? LIMIT 1",
    [token]
  );
  const user = rows[0];

  if (!user) {
    const error = new Error("Invalid or expired verification token");
    error.status = 400;
    throw error;
  }

  await pool.query(
    "UPDATE users SET is_verified = TRUE, verification_token = NULL WHERE id = ?",
    [user.id]
  );

  return true;
}

async function requestPasswordReset(email) {
  const user = await findUserByEmail(email);
  if (!user) {
    // We return true even if user not found for security (don't reveal email existence)
    return true;
  }

  const resetToken = crypto.randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 3600000); // 1 hour

  await pool.query(
    "UPDATE users SET reset_password_token = ?, reset_password_expires = ? WHERE id = ?",
    [resetToken, expires, user.id]
  );

  mailService.sendPasswordResetEmail(email, resetToken).catch(err => {
    console.error("Failed to send password reset email:", err);
  });

  return true;
}

async function resetPassword(token, newPassword) {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE reset_password_token = ? AND reset_password_expires > NOW() LIMIT 1",
    [token]
  );
  const user = rows[0];

  if (!user) {
    const error = new Error("Invalid or expired reset token");
    error.status = 400;
    throw error;
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await pool.query(
    "UPDATE users SET password_hash = ?, reset_password_token = NULL, reset_password_expires = NULL WHERE id = ?",
    [hashedPassword, user.id]
  );

  return true;
}

async function resendVerificationEmail(email) {
  const user = await findUserByEmail(email);
  if (!user) return true; // Security: don't reveal email presence

  if (user.is_verified) {
    const error = new Error("Tài khoản đã được xác thực.");
    error.status = 400;
    throw error;
  }

  const verificationToken = crypto.randomBytes(32).toString("hex");
  await pool.query(
    "UPDATE users SET verification_token = ? WHERE id = ?",
    [verificationToken, user.id]
  );

  mailService.sendVerificationEmail(email, verificationToken).catch(err => {
    console.error("Background error resending verification email:", err);
  });

  return true;
}

async function loginUser({ email, password, remember = false }) {
  const user = await findUserByEmail(email);
  if (!user) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const passwordOk = await bcrypt.compare(password, user.password_hash);
  if (!passwordOk) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  // FORCE VERIFICATION
  if (!user.is_verified) {
    const error = new Error("Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.");
    error.status = 403;
    throw error;
  }

  if (user.status === "banned") {
    const error = new Error("Tài khoản đã bị khóa. Vui lòng liên hệ quản trị viên.");
    error.status = 403;
    throw error;
  }

  if (user.status === "inactive") {
    const error = new Error("Tài khoản đang tạm ngưng. Vui lòng liên hệ quản trị viên.");
    error.status = 403;
    throw error;
  }

  const safeUser = {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    isVerified: true,
  };

  const token = signAccessToken(safeUser, remember);
  return { token, user: safeUser };
}

async function getCurrentUser(userId) {
  const user = await findUserById(userId);
  if (!user) {
    const error = new Error("User not found");
    error.status = 404;
    throw error;
  }

  return {
    id: user.id,
    fullName: user.full_name,
    email: user.email,
    role: user.role,
    isVerified: Boolean(user.is_verified),
  };
}

module.exports = {
  registerUser,
  loginUser,
  getCurrentUser,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  resendVerificationEmail,
};
