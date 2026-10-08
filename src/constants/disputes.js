const DISPUTE_STATUSES = Object.freeze([
  "open",
  "under_review",
  "resolved_release_payment",
  "resolved_refund",
  "rejected",
]);

const DISPUTE_STATUS_SET = new Set(DISPUTE_STATUSES);

module.exports = {
  DISPUTE_STATUSES,
  DISPUTE_STATUS_SET,
};
