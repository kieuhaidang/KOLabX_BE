const { pool } = require("../config/db");
const withdrawalService = require("./withdrawal.service");

async function getOrCreateWallet(userId) {
  // Ensure wallet exists
  await pool.query(
    "INSERT IGNORE INTO wallets (user_id, balance) VALUES (?, 0.00)",
    [userId]
  );

  const [rows] = await pool.query(
    "SELECT id, user_id, balance, created_at, updated_at FROM wallets WHERE user_id = ? LIMIT 1",
    [userId]
  );
  return rows[0] || null;
}

async function getWalletTransactions(walletId) {
  const [rows] = await pool.query(
    `SELECT id, wallet_id, amount, type, reference_id, description, created_at
     FROM wallet_transactions
     WHERE wallet_id = ?
     ORDER BY created_at DESC`,
    [walletId]
  );
  return rows.map((r) => ({
    id: r.id,
    walletId: r.wallet_id,
    amount: Number(r.amount || 0),
    type: r.type,
    referenceId: r.reference_id,
    description: r.description,
    createdAt: r.created_at,
  }));
}

async function requestWalletWithdrawal(userId, payload) {
  const { amount, bankName, bankAccountNumber, bankAccountName } = payload;
  const parsedAmount = Number(amount);

  if (isNaN(parsedAmount) || parsedAmount < 10000) {
    const error = new Error("Số tiền rút tối thiểu là 10,000 VND");
    error.status = 400;
    throw error;
  }

  const wallet = await getOrCreateWallet(userId);
  if (!wallet || Number(wallet.balance) < parsedAmount) {
    const error = new Error("Số dư ví không đủ");
    error.status = 400;
    throw error;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Deduct wallet balance
    await connection.query(
      "UPDATE wallets SET balance = balance - ? WHERE id = ?",
      [parsedAmount, wallet.id]
    );

    // Create transaction log
    await connection.query(
      `INSERT INTO wallet_transactions (wallet_id, amount, type, description)
       VALUES (?, ?, 'withdrawal', ?)`,
      [wallet.id, -parsedAmount, `Rút tiền về tài khoản ${bankName} (${bankAccountNumber})`]
    );

    // Create withdrawal request
    const withdrawal = await withdrawalService.createWithdrawal(userId, {
      amount: parsedAmount,
      bankName,
      bankAccountNumber,
      bankAccountName,
    });

    await connection.commit();
    return { wallet: await getOrCreateWallet(userId), withdrawal };
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

module.exports = {
  getOrCreateWallet,
  getWalletTransactions,
  requestWalletWithdrawal,
};
