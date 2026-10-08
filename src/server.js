const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const cookieParser = require("cookie-parser");

// 1. Chỉ nạp dotenv nếu không chạy trên Hosting (Litespeed đã nạp sẵn)
if (!process.env.DB_HOST) {
    try {
        require("dotenv").config();
        console.log("[LOCAL] Loaded environment from .env file");
    } catch (e) {
        // Bỏ qua nếu không có module dotenv
    }
}

const app = express();
const port = process.env.PORT || 5000;

// 2. Tự động xác định đường dẫn DIST (Làm việc được cả Local và Azdigi)
// Lấy thư mục cha của thư mục 'src' hiện tại
const APP_ROOT = path.resolve(__dirname, "..");
const DIST_PATH = path.join(APP_ROOT, "dist");
const UPLOADS_PATH = path.join(APP_ROOT, "uploads");

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: true, credentials: true }));

// 3. Serve file tĩnh (Ưu tiên assets)
app.use("/assets", express.static(path.join(DIST_PATH, "assets"), {
    fallthrough: false,
    index: false
}));
app.use(express.static(DIST_PATH));
app.use("/uploads", express.static(UPLOADS_PATH));

// 4. API Routes
try {
    const apiRoutes = require("./routes");
    app.use("/api", apiRoutes);
} catch (e) {
    console.error("[ERROR] API Routes failed:", e.message);
}

// 5. Catch-all cho React Router
app.get("*", (req, res, next) => {
    if (req.url.startsWith("/api")) return next();
    if (req.url.includes(".")) return res.status(404).end();

    const indexPath = path.join(DIST_PATH, "index.html");
    if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
    } else {
        res.status(200).send("KOLab Server is running. UI build not found.");
    }
});

// Xử lý lỗi
const { notFoundHandler, errorHandler } = require("./middleware/error.middleware");
app.use(notFoundHandler);
app.use(errorHandler);

// 6. Khởi động
const { checkDbConnection } = require("./config/db");
async function startServer() {
    try {
        console.log(`[STARTUP] DB_USER: ${process.env.DB_USER}`);
        await checkDbConnection();
        console.log("[SUCCESS] Database connected.");
    } catch (error) {
        console.error("[ERROR] DB connection failed:", error.message);
    }

    app.listen(port, () => {
        console.log(`[ONLINE] Server live on port ${port}`);
    });
}

startServer();
