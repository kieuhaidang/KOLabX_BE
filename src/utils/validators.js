function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isNonEmptyString(value, maxLength) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (maxLength && trimmed.length > maxLength) return false;
  return true;
}

function validateRole(role) {
  return role === "marketer" || role === "koc" || role === "admin";
}

module.exports = {
  isValidEmail,
  isNonEmptyString,
  validateRole,
};
