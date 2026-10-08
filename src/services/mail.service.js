const nodemailer = require("nodemailer");

function createTransporter() {
  const host = process.env.MAIL_HOST;
  const port = Number(process.env.MAIL_PORT || 465);
  const secure = process.env.MAIL_SECURE === "true";
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASS;

  console.log(`[MailService] Attempting to connect to ${host}:${port} (Secure: ${secure}) as ${user}`);

  if (!host || host === "undefined") {
    console.error("ERROR: MAIL_HOST is not defined in environment variables!");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass,
    },
  });
}

async function sendMail({ to, subject, html }) {
  try {
    const transporter = createTransporter();
    const info = await transporter.sendMail({
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_ADDRESS}>`,
      to,
      subject,
      html,
    });
    console.log("Email sent: %s", info.messageId);
    return info;
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
}

async function sendVerificationEmail(email, token) {
  let domain = process.env.FRONTEND_URL || "https://kolabbooking.com";
  if (!domain.startsWith("http")) domain = `https://${domain}`;
  
  const url = `${domain}/verify-email?token=${token}`;
  return sendMail({
    to: email,
    subject: "Xác nhận tài khoản KOLab",
    html: `
      <h1>Chào mừng đến với KOLab!</h1>
      <p>Vui lòng nhấn vào liên kết bên dưới để xác nhận tài khoản của bạn:</p>
      <a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 5px;">Xác nhận ngay</a>
      <p>Nếu bạn không đăng ký tài khoản này, vui lòng bỏ qua email này.</p>
    `,
  });
}

async function sendPasswordResetEmail(email, token) {
  const url = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  return sendMail({
    to: email,
    subject: "Đặt lại mật khẩu KOLab",
    html: `
      <h1>Yêu cầu đặt lại mật khẩu</h1>
      <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản KOLab của mình.</p>
      <p>Vui lòng nhấn vào liên kết bên dưới để đặt lại mật khẩu (liên kết có hiệu lực trong 1 giờ):</p>
      <a href="${url}" style="display: inline-block; padding: 10px 20px; background-color: #7c3aed; color: white; text-decoration: none; border-radius: 5px;">Đặt lại mật khẩu</a>
      <p>Nếu bạn không yêu cầu điều này, vui lòng bỏ qua email này.</p>
    `,
  });
}

async function sendBookingInvitationEmail(kocEmail, kocName, campaignTitle, marketerName, campaignDescription) {
  let domain = process.env.FRONTEND_URL || "https://kolabbooking.com";
  if (!domain.startsWith("http")) domain = `https://${domain}`;
  
  const loginUrl = `${domain}/login`;

  return sendMail({
    to: kocEmail,
    subject: `[KOLab] Lời mời hợp tác mới: ${campaignTitle}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #FF3300; margin: 0;">KOLab</h1>
        </div>
        <div style="background-color: #f8fafc; padding: 24px; border-radius: 8px;">
          <h2 style="color: #0f172a; margin-top: 0;">Chào ${kocName},</h2>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">
            Bạn vừa nhận được một lời mời hợp tác mới từ nhãn hàng <strong>${marketerName}</strong> trên hệ thống KOLab.
          </p>
          <div style="background-color: white; border: 1px solid #e2e8f0; padding: 16px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; font-weight: bold;">Tên chiến dịch:</p>
            <p style="margin: 4px 0 16px 0; color: #0f172a; font-size: 18px; font-weight: bold;">${campaignTitle}</p>
            
            <p style="margin: 0; color: #64748b; font-size: 14px; text-transform: uppercase; font-weight: bold;">Mô tả chiến dịch:</p>
            <p style="margin: 4px 0 0 0; color: #475569; font-size: 15px; line-height: 1.5; white-space: pre-wrap;">${campaignDescription || "Vui lòng xem chi tiết trên hệ thống"}</p>
          </div>
          <p style="color: #475569; font-size: 16px; line-height: 1.6;">
            Hãy truy cập vào KOLab ngay để xem chi tiết yêu cầu, báo giá và phản hồi lời mời này nhé.
          </p>
          <div style="text-align: center; margin-top: 32px;">
            <a href="${loginUrl}" style="background-color: #FF3300; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; display: inline-block;">Đăng nhập để xem chi tiết</a>
          </div>
        </div>
        <div style="text-align: center; margin-top: 24px; color: #94a3b8; font-size: 12px;">
          <p>Email này được gửi tự động từ hệ thống KOLab. Vui lòng không trả lời email này.</p>
        </div>
      </div>
    `,
  });
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendBookingInvitationEmail,
};
