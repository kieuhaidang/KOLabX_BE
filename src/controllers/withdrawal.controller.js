const withdrawalService = require("../services/withdrawal.service");
const profileService = require("../services/profile.service");

async function requestWithdrawal(req, res, next) {
  try {
    const { amount, earningIds } = req.body;
    const userId = req.user.id;

    // 1. Kiểm tra số tiền tối thiểu
    if (!amount || amount < 10000) {
      return res.status(400).json({ message: "Số tiền rút tối thiểu là 10,000 VND" });
    }

    // 2. Lấy thông tin ngân hàng từ profile
    const profile = await profileService.getMyProfile(userId, "koc");
    if (!profile.bankName || !profile.bankAccountNumber) {
      return res.status(400).json({ message: "Vui lòng cập nhật thông tin ngân hàng trong Hồ sơ trước khi rút tiền" });
    }

    // 3. Thực hiện tạo yêu cầu rút tiền (Service sẽ check số dư thực tế và khóa earnings)
    const withdrawal = await withdrawalService.createWithdrawal(userId, {
      amount,
      bankName: profile.bankName,
      bankAccountNumber: profile.bankAccountNumber,
      bankAccountName: profile.bankAccountName || profile.fullName,
      earningIds
    });

    return res.status(201).json({ 
      message: "Yêu cầu rút tiền đã được gửi thành công",
      withdrawal 
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function getMyWithdrawals(req, res, next) {
  try {
    const items = await withdrawalService.listWithdrawalsByKoc(req.user.id);
    return res.status(200).json({ items });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function adminListWithdrawals(req, res, next) {
  try {
    const { status } = req.query;
    const items = await withdrawalService.listAllWithdrawals(status);
    return res.status(200).json({ items });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

async function adminUpdateStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    const withdrawal = await withdrawalService.updateWithdrawalStatus(id, status, adminNote);
    return res.status(200).json({ withdrawal });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({ message: error.message });
    }
    return next(error);
  }
}

module.exports = {
  requestWithdrawal,
  getMyWithdrawals,
  adminListWithdrawals,
  adminUpdateStatus,
};
