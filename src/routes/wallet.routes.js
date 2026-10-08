const express = require("express");
const router = express.Router();
const walletController = require("../controllers/wallet.controller");
const { requireAuth } = require("../middleware/auth.middleware");
const { requireRoles } = require("../middleware/role.middleware");
const { ROLES } = require("../constants/roles");

// Get current user's wallet info (balance, transactions, withdrawals)
router.get("/me", requireAuth, requireRoles(ROLES.MARKETER, ROLES.KOC), walletController.getMyWallet);

// Request a withdrawal from the wallet
router.post("/withdraw", requireAuth, requireRoles(ROLES.MARKETER, ROLES.KOC), walletController.requestWithdrawal);

module.exports = router;
