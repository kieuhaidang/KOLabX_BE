const shortlistService = require("../services/shortlist.service");

async function toggleShortlist(req, res, next) {
  try {
    const { kocId } = req.body;
    if (!kocId) return res.status(400).json({ message: "Missing kocId" });

    const result = await shortlistService.toggleShortlist(req.user.id, kocId);
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function listShortlist(req, res, next) {
  try {
    const items = await shortlistService.listShortlist(req.user.id);
    res.json({ items });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  toggleShortlist,
  listShortlist
};
