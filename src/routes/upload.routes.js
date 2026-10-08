const express = require("express");
const upload = require("../middleware/multer.middleware");
const { requireAuth } = require("../middleware/auth.middleware");

const router = express.Router();

router.post("/", requireAuth, upload.single("file"), (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file provided." });
    }

    // Return the relative URL and file info
    const fileUrl = `/uploads/${req.file.filename}`;
    
    return res.status(200).json({
      message: "File uploaded successfully",
      url: fileUrl,
      fileName: req.file.originalname,
      fileType: req.file.mimetype,
      size: req.file.size
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
