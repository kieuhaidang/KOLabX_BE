const adminDisputeService = require("../services/admin.dispute.service");
const { createAuditLog } = require("../services/audit.service");
const { DISPUTE_STATUS_SET } = require("../constants/disputes");

function parsePositiveInt(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

async function listDisputes(req, res, next) {
  try {
    const status = req.query.status?.trim();
    if (status && !DISPUTE_STATUS_SET.has(status)) {
      return res.status(400).json({ message: "Invalid status filter" });
    }

    const items = await adminDisputeService.listDisputes({
      status,
      search: req.query.search?.trim(),
    });

    return res.status(200).json({ items });
  } catch (error) {
    return next(error);
  }
}

async function getDisputeById(req, res, next) {
  try {
    const disputeId = parsePositiveInt(req.params.id);
    if (!disputeId) {
      return res.status(400).json({ message: "Invalid dispute id" });
    }

    const dispute = await adminDisputeService.getDisputeById(disputeId);
    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    return res.status(200).json({ dispute });
  } catch (error) {
    return next(error);
  }
}

async function updateDisputeStatus(req, res, next) {
  try {
    const disputeId = parsePositiveInt(req.params.id);
    if (!disputeId) {
      return res.status(400).json({ message: "Invalid dispute id" });
    }

    const { status, resolutionNote } = req.body || {};
    if (!status || typeof status !== "string") {
      return res.status(400).json({ message: "status is required" });
    }

    if (!DISPUTE_STATUS_SET.has(status)) {
      return res.status(400).json({ message: "Invalid dispute status" });
    }

    const dispute = await adminDisputeService.updateDisputeStatus(
      disputeId,
      status,
      typeof resolutionNote === "string" ? resolutionNote.trim() || null : null
    );

    if (!dispute) {
      return res.status(404).json({ message: "Dispute not found" });
    }

    createAuditLog({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action: "admin.dispute.status.update",
      targetType: "dispute",
      targetId: disputeId,
      description: `Dispute #${disputeId} -> ${status}`,
    });

    return res.status(200).json({
      message: "Cập nhật tranh chấp thành công",
      dispute,
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  listDisputes,
  getDisputeById,
  updateDisputeStatus,
};
