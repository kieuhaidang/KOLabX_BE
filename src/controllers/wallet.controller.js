const walletService = require("../services/wallet.service");
const withdrawalService = require("../services/withdrawal.service");

async function getMyWallet(req, res, next) {
  try {
    const userId = req.user.id;
    const wallet = await walletService.getOrCreateWallet(userId);
    if (!wallet) {
      return res.status(404).json({ message: "Không tìm thấy ví của người dùng" });
    }
    const transactions = await walletService.getWalletTransactions(wallet.id);
    const withdrawals = await withdrawalService.listWithdrawalsByKoc(userId);

    return res.status(200).json({
      wallet,
      transactions,
      withdrawals,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function requestWithdrawal(req, res, next) {
  try {
    const userId = req.user.id;
    const { amount, bankName, bankAccountNumber, bankAccountName } = req.body;

    if (!amount || amount < 10000) {
      return res.status(400).json({ message: "Số tiền rút tối thiểu là 10,000 VND" });
    }
    if (!bankName || !bankAccountNumber || !bankAccountName) {
      return res.status(400).json({ message: "Vui lòng nhập đầy đủ thông tin ngân hàng" });
    }

    const result = await walletService.requestWalletWithdrawal(userId, {
      amount,
      bankName,
      bankAccountNumber,
      bankAccountName,
    });

    return res.status(201).json({
      message: "Yêu cầu rút tiền từ ví đã được gửi thành công",
      wallet: result.wallet,
      withdrawal: result.withdrawal,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

module.exports = {
  getMyWallet,
  requestWithdrawal,
};
