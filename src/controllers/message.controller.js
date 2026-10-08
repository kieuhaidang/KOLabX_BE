const bookingService = require("../services/booking.service");
const messageService = require("../services/message.service");
const { isNonEmptyString } = require("../utils/validators");

function canAccessBooking(user, booking) {
  if (user.role === "admin") return true;
  return booking.marketerId === user.id || booking.kocId === user.id;
}

async function listMessagesByBooking(req, res, next) {
  try {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ message: "Invalid booking id" });
    }

    const booking = await bookingService.getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!canAccessBooking(req.user, booking)) {
      return res.status(403).json({ message: "You do not have permission to access this booking messages" });
    }

    const items = await messageService.listMessagesByBooking(bookingId, req.user.id);
    return res.status(200).json({ items });
  } catch (error) {
    return next(error);
  }
}

async function createMessage(req, res, next) {
  try {
    const bookingId = Number(req.params.bookingId);
    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return res.status(400).json({ message: "Invalid booking id" });
    }

    const { content, fileUrl, fileType } = req.body || {};
    if (!isNonEmptyString(content) && !fileUrl) {
      return res.status(400).json({ message: "content or file is required" });
    }

    const booking = await bookingService.getBookingById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: "Booking not found" });
    }

    if (!canAccessBooking(req.user, booking)) {
      return res.status(403).json({ message: "You do not have permission to send message in this booking" });
    }

    console.log("Creating message for booking:", bookingId, "sender:", req.user.id, "fileType:", fileType);

    const message = await messageService.createMessage({
      bookingId,
      senderId: req.user.id,
      content: (content || "").trim(),
      fileUrl,
      fileType
    });

    return res.status(201).json({
      message: "Message sent successfully",
      item: message,
    });
  } catch (error) {
    return next(error);
  }
}

async function markAsRead(req, res, next) {
  try {
    const bookingId = Number(req.params.bookingId);
    const booking = await bookingService.getBookingById(bookingId);
    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (!canAccessBooking(req.user, booking)) {
      return res.status(403).json({ message: "Access denied" });
    }

    await messageService.markAsRead(bookingId, req.user.id);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
}

async function hideChat(req, res, next) {
  try {
    const bookingId = Number(req.params.bookingId);
    await bookingService.updateVisibility(bookingId, req.user.id, req.user.role, 'hide');
    res.json({ success: true, message: "Chat hidden" });
  } catch (error) {
    next(error);
  }
}

async function deleteChat(req, res, next) {
  try {
    const bookingId = Number(req.params.bookingId);
    await bookingService.updateVisibility(bookingId, req.user.id, req.user.role, 'delete');
    res.json({ success: true, message: "Chat deleted" });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  listMessagesByBooking,
  createMessage,
  markAsRead,
  hideChat,
  deleteChat,
};
