const { pool } = require("../config/db");

const MISSING_WITHDRAWALS_TABLE_CODES = new Set(["ER_NO_SUCH_TABLE", "ER_BAD_TABLE_ERROR"]);

function isMissingWithdrawalsTable(error) {
  return (
    MISSING_WITHDRAWALS_TABLE_CODES.has(error?.code) ||
    /withdrawals/i.test(error?.message || "") && /doesn't exist|unknown table/i.test(error?.message || "")
  );
}

function missingWithdrawalsTableError() {
  const error = new Error("Withdrawals table is not available. Please run the withdrawals migration.");
  error.status = 503;
  return error;
}

function mapWithdrawalRow(row) {
  return {
    id: row.id,
    kocId: row.koc_id,
    amount: Number(row.amount || 0),
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankAccountName: row.bank_account_name,
    status: row.status,
    adminNote: row.admin_note,
    processedAt: row.processed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createWithdrawal(kocId, data) {
  const { amount, bankName, bankAccountNumber, bankAccountName, earningIds } = data;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    let selectedEarnings = [];
    if (earningIds && earningIds.length > 0) {
      const [earningRows] = await connection.query(
        `SELECT id, amount, status, withdrawal_id FROM earnings WHERE id IN (?) AND koc_id = ? FOR UPDATE`,
        [earningIds, kocId]
      );
      if (earningRows.length !== earningIds.length) {
        throw new Error("Một hoặc nhiều khoản thu nhập không khả dụng");
      }
      for (const row of earningRows) {
        if (row.withdrawal_id !== null || row.status !== 'pending') {
          throw new Error("Một hoặc nhiều khoản thu nhập đã được yêu cầu rút hoặc đã thanh toán");
        }
      }
      const calculatedAmount = earningRows.reduce((sum, row) => sum + Number(row.amount), 0);
      if (calculatedAmount !== amount) {
        throw new Error("Số tiền yêu cầu không khớp với tổng tiền của các chiến dịch đã chọn");
      }
      selectedEarnings = earningRows;
    } else {
      const [earningRows] = await connection.query(
        `SELECT id, amount, status, withdrawal_id FROM earnings 
         WHERE koc_id = ? AND status = 'pending' AND withdrawal_id IS NULL 
         ORDER BY created_at ASC FOR UPDATE`,
        [kocId]
      );
      let sum = 0;
      for (const row of earningRows) {
        selectedEarnings.push(row);
        sum += Number(row.amount);
        if (sum >= amount) break;
      }
      if (sum < amount) {
        throw new Error(`Số dư khả dụng không đủ để rút số tiền yêu cầu. (Số dư khả dụng: ${sum} VNĐ)`);
      }
    }

    const [result] = await connection.query(
      `INSERT INTO withdrawals (koc_id, amount, bank_name, bank_account_number, bank_account_name)
       VALUES (?, ?, ?, ?, ?)`,
      [kocId, amount, bankName, bankAccountNumber, bankAccountName]
    );
    const withdrawalId = result.insertId;

    const selectedIds = selectedEarnings.map(e => e.id);
    if (selectedIds.length > 0) {
      await connection.query(
        `UPDATE earnings SET withdrawal_id = ? WHERE id IN (?)`,
        [withdrawalId, selectedIds]
      );
    }

    await connection.commit();
    connection.release();

    return getWithdrawalById(withdrawalId);
  } catch (error) {
    await connection.rollback();
    connection.release();
    if (isMissingWithdrawalsTable(error)) {
      throw missingWithdrawalsTableError();
    }
    throw error;
  }
}

async function listWithdrawalsByKoc(kocId) {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM withdrawals WHERE koc_id = ? ORDER BY created_at DESC",
      [kocId]
    );
    return rows.map(mapWithdrawalRow);
  } catch (error) {
    if (isMissingWithdrawalsTable(error)) return [];
    throw error;
  }
}

async function listAllWithdrawals(status = null) {
  let query = "SELECT * FROM withdrawals";
  const params = [];
  
  if (status) {
    query += " WHERE status = ?";
    params.push(status);
  }
  
  query += " ORDER BY created_at DESC";
  
  try {
    const [rows] = await pool.query(query, params);
    return rows.map(mapWithdrawalRow);
  } catch (error) {
    if (isMissingWithdrawalsTable(error)) return [];
    throw error;
  }
}

async function getWithdrawalById(id) {
  try {
    const [rows] = await pool.query("SELECT * FROM withdrawals WHERE id = ? LIMIT 1", [id]);
    return rows[0] ? mapWithdrawalRow(rows[0]) : null;
  } catch (error) {
    if (isMissingWithdrawalsTable(error)) return null;
    throw error;
  }
}

async function updateWithdrawalStatus(id, status, adminNote = null) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(
      `UPDATE withdrawals 
       SET status = ?, admin_note = ?, processed_at = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [status, adminNote, id]
    );

    if (status === "completed") {
      await connection.query(
        `UPDATE earnings 
         SET status = 'paid', paid_at = CURRENT_TIMESTAMP 
         WHERE withdrawal_id = ?`,
        [id]
      );
    } else if (status === "rejected") {
      await connection.query(
        `UPDATE earnings 
         SET withdrawal_id = NULL 
         WHERE withdrawal_id = ?`,
        [id]
      );
    }

    await connection.commit();
    connection.release();

    return getWithdrawalById(id);
  } catch (error) {
    await connection.rollback();
    connection.release();
    if (isMissingWithdrawalsTable(error)) {
      throw missingWithdrawalsTableError();
    }
    throw error;
  }
}

module.exports = {
  createWithdrawal,
  listWithdrawalsByKoc,
  listAllWithdrawals,
  getWithdrawalById,
  updateWithdrawalStatus,
};
