const jwt = require("jsonwebtoken");

function signAccessToken(user, remember = false) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    process.env.JWT_SECRET,
    { expiresIn: remember ? "30d" : "1d" }
  );
}

module.exports = {
  signAccessToken,
};