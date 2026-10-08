const { pool } = require("../config/db");
const earningService = require("./earning.service");

function mapBookingRow(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    marketerId: row.marketer_id,
    kocId: row.koc_id,
    direction: row.direction,
    status: row.status,
    offeredPrice: Number(row.offered_price || 0),
    note: row.note,
    estimatedDeliveryDays: row.estimated_delivery_days,
    sampleLink: row.sample_link,
    draftLink: row.draft_link,
    finalLink: row.final_link,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Joined fields
    campaignTitle: row.campaign_title,
    campaignCategory: row.campaign_category,
    campaignPlatform: row.campaign_platform,
    marketerName: row.marketer_name,
    kocName: row.koc_display_name || row.koc_name,
    display_name: row.koc_display_name,
    niche: row.niche,
    platform: row.platform,
    followers: row.followers,
    engagement_rate: row.engagement_rate,
    avatarUrl: row.avatar_url,
  };
}

async function getCampaignById(campaignId) {
  const [rows] = await pool.query("SELECT id, marketer_id, status FROM campaigns WHERE id = ? LIMIT 1", [campaignId]);
  return rows[0] || null;
}

async function createBooking(payload) {
  const [result] = await pool.query(
    `INSERT INTO bookings (
      campaign_id, marketer_id, koc_id, direction, status, offered_price, note, estimated_delivery_days, sample_link
    ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      payload.campaignId,
      payload.marketerId,
      payload.kocId,
      payload.direction,
      payload.offeredPrice ?? 0,
      payload.note ?? null,
      payload.estimatedDeliveryDays ?? 7,
      payload.sampleLink ?? null,
    ]
  );

  return getBookingById(result.insertId);
}

async function listBookingsForUser(user, filters = {}) {
  const conditions = [];
  const params = [];

  if (user.role === "admin") {
    conditions.push("1 = 1");
  } else if (user.role === "marketer") {
    conditions.push("b.marketer_id = ?");
    params.push(user.id);
    if (filters.onlyVisible) {
      conditions.push("b.marketer_hidden = 0");
    }
  } else if (user.role === "koc") {
    conditions.push("b.koc_id = ?");
    params.push(user.id);
    if (filters.onlyVisible) {
      conditions.push("b.koc_hidden = 0");
    }
  } else {
    conditions.push("1 = 0");
  }

  // New business rule: Filter by status if requested (e.g., for chat)
  if (filters.status) {
    conditions.push("b.status = ?");
    params.push(filters.status);
  }

  if (filters.search) {
    conditions.push("(c.title LIKE ? OR um.full_name LIKE ? OR uk.full_name LIKE ? OR kp.display_name LIKE ?)");
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  const [rows] = await pool.query(
    `SELECT b.*, 
            c.title as campaign_title, 
            c.category as campaign_category, 
            c.platform as campaign_platform,
            um.full_name as marketer_name,
            uk.full_name as koc_name,
            kp.display_name as koc_display_name
     FROM bookings b
     JOIN campaigns c ON b.campaign_id = c.id
     JOIN users um ON b.marketer_id = um.id
     JOIN users uk ON b.koc_id = uk.id
     LEFT JOIN koc_profiles kp ON uk.id = kp.user_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY b.created_at DESC`,
    params
  );

  return rows.map(mapBookingRow);
}

async function updateVisibility(id, userId, role, action) {
  if (role === 'marketer') {
    if (action === 'hide') {
      await pool.query("UPDATE bookings SET marketer_hidden = 1 WHERE id = ? AND marketer_id = ?", [id, userId]);
    } else if (action === 'delete') {
      await pool.query("UPDATE bookings SET marketer_hidden = 1, marketer_deleted_at = NOW() WHERE id = ? AND marketer_id = ?", [id, userId]);
    }
  } else if (role === 'koc') {
    if (action === 'hide') {
      await pool.query("UPDATE bookings SET koc_hidden = 1 WHERE id = ? AND koc_id = ?", [id, userId]);
    } else if (action === 'delete') {
      await pool.query("UPDATE bookings SET koc_hidden = 1, koc_deleted_at = NOW() WHERE id = ? AND koc_id = ?", [id, userId]);
    }
  }
  return true;
}

async function getBookingById(id) {
  const [rows] = await pool.query(
    `SELECT b.*,
            c.title as campaign_title,
            c.description as campaign_description,
            c.category as campaign_category,
            c.platform as campaign_platform,
            u.full_name as marketer_name
     FROM bookings b
     JOIN campaigns c ON b.campaign_id = c.id
     JOIN users u ON b.marketer_id = u.id
     WHERE b.id = ? LIMIT 1`, 
    [id]
  );
  if (!rows[0]) return null;
  const booking = mapBookingRow(rows[0]);
  return {
    ...booking,
    campaign: {
      title: rows[0].campaign_title,
      description: rows[0].campaign_description,
      category: rows[0].campaign_category,
      platform: rows[0].campaign_platform,
      marketerName: rows[0].marketer_name,
    },
  };
}

async function getKocBookingDetail(id, kocId) {
  const [rows] = await pool.query(
    `SELECT b.*,
            c.title as campaign_title,
            c.description as campaign_description,
            c.category as campaign_category,
            c.platform as campaign_platform,
            u.full_name as marketer_name
     FROM bookings b
     JOIN campaigns c ON b.campaign_id = c.id
     JOIN users u ON b.marketer_id = u.id
     WHERE b.id = ? AND b.koc_id = ? LIMIT 1`,
    [id, kocId]
  );

  if (!rows[0]) return null;

  const booking = mapBookingRow(rows[0]);
  return {
    ...booking,
    campaign: {
      title: rows[0].campaign_title,
      description: rows[0].campaign_description,
      category: rows[0].campaign_category,
      platform: rows[0].campaign_platform,
      marketerName: rows[0].marketer_name,
    },
  };
}

function resolveSubmissionStatus(draftLink, finalLink) {
  const draft = String(draftLink || "").trim();
  const final = String(finalLink || "").trim();
  if (final) return "final_submitted";
  if (draft) return "draft_submitted";
  return null;
}

async function submitBookingSubmission(id, kocId, payload) {
  const booking = await getBookingById(id);
  if (!booking || booking.kocId !== kocId) {
    const error = new Error("Booking not found");
    error.status = 404;
    throw error;
  }

  const allowedStatuses = new Set(["accepted", "ready_to_connect", "draft_submitted", "revision_requested", "final_submitted"]);
  if (!allowedStatuses.has(booking.status)) {
    const error = new Error("Booking is not in a submittable state");
    error.status = 400;
    throw error;
  }

  const draftLink = payload.draftLink !== undefined ? payload.draftLink : booking.draftLink;
  const finalLink = payload.finalLink !== undefined ? payload.finalLink : booking.finalLink;

  if (!String(draftLink || "").trim() && !String(finalLink || "").trim()) {
    const error = new Error("At least one submission link is required");
    error.status = 400;
    throw error;
  }

  const nextStatus = resolveSubmissionStatus(draftLink, finalLink) || booking.status;

  await pool.query(
    `UPDATE bookings
     SET draft_link = ?, final_link = ?, submitted_at = NOW(), status = ?, review_note = NULL
     WHERE id = ? AND koc_id = ?`,
    [draftLink || null, finalLink || null, nextStatus, id, kocId]
  );

  return getKocBookingDetail(id, kocId);
}

async function updateBookingContent(id, kocId, payload) {
  return submitBookingSubmission(id, kocId, payload);
}

async function listMarketerSubmissions(marketerId) {
  const [rows] = await pool.query(
    `SELECT
      b.id AS booking_id,
      b.campaign_id,
      c.title AS campaign_title,
      b.koc_id,
      kp.id AS koc_profile_id,
      k.full_name AS koc_name,
      k.email AS koc_email,
      b.draft_link,
      b.final_link,
      b.status,
      b.offered_price,
      b.submitted_at,
      b.reviewed_at,
      b.review_note
     FROM bookings b
     JOIN campaigns c ON c.id = b.campaign_id
     JOIN users k ON k.id = b.koc_id
     LEFT JOIN koc_profiles kp ON kp.user_id = b.koc_id
     WHERE b.marketer_id = ?
       AND (b.draft_link IS NOT NULL OR b.final_link IS NOT NULL)
     ORDER BY COALESCE(b.submitted_at, b.updated_at) DESC`,
    [marketerId]
  );

  return rows.map((row) => ({
    bookingId: row.booking_id,
    campaignId: row.campaign_id,
    campaignTitle: row.campaign_title,
    kocId: row.koc_id,
    kocProfileId: row.koc_profile_id,
    kocName: row.koc_name,
    kocEmail: row.koc_email,
    draftLink: row.draft_link,
    finalLink: row.final_link,
    status: row.status,
    offeredPrice: Number(row.offered_price || 0),
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
  }));
}

async function reviewBookingSubmission(id, marketerId, payload) {
  const booking = await getBookingById(id);
  if (!booking || booking.marketerId !== marketerId) {
    const error = new Error("Booking not found");
    error.status = 404;
    throw error;
  }

  const action = payload.action;
  const reviewNote = String(payload.reviewNote || "").trim() || null;

  if (action === "request_revision") {
    await pool.query(
      `UPDATE bookings
       SET status = 'revision_requested', reviewed_at = NOW(), review_note = ?
       WHERE id = ? AND marketer_id = ?`,
      [reviewNote, id, marketerId]
    );
    return getBookingById(id);
  }

  if (action === "approve") {
    if (!String(booking.finalLink || "").trim()) {
      const error = new Error("Final video link is required before approval");
      error.status = 400;
      throw error;
    }

    const [campaignRows] = await pool.query(
      "SELECT id, remaining_budget FROM campaigns WHERE id = ? LIMIT 1",
      [booking.campaignId]
    );
    const campaign = campaignRows[0];
    const price = Number(booking.offeredPrice || 0);

    if (campaign && Number(campaign.remaining_budget) >= price) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query(
          "UPDATE campaigns SET remaining_budget = remaining_budget - ? WHERE id = ?",
          [price, campaign.id]
        );

        await connection.query(
          `UPDATE bookings
           SET status = 'completed', reviewed_at = NOW(), review_note = ?
           WHERE id = ? AND marketer_id = ?`,
          [reviewNote, id, marketerId]
        );

        await connection.commit();
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }

      const updated = await getBookingById(id);
      await earningService.createEarningForBooking(updated);
      return { success: true, booking: updated };
    } else {
      const paymentService = require("./payment.service");
      const payAmount = price - (campaign ? Number(campaign.remaining_budget) : 0);

      const paymentLinkRes = await paymentService.createPaymentLink(
        marketerId,
        payAmount,
        `Pay booking #${id}`,
        id
      );

      return {
        success: false,
        requiresPayment: true,
        checkoutUrl: paymentLinkRes.checkoutUrl,
        amount: payAmount,
      };
    }
  }

  const error = new Error("Invalid review action");
  error.status = 400;
  throw error;
}

async function updateBookingStatus(id, status) {
  const connection = await pool.getConnection();
  let released = false;
  try {
    await connection.beginTransaction();

    const [bookingRows] = await connection.query(
      "SELECT * FROM bookings WHERE id = ? LIMIT 1 FOR UPDATE",
      [id]
    );
    const booking = bookingRows[0];
    if (!booking) {
      const error = new Error("Booking không tồn tại");
      error.status = 404;
      throw error;
    }

    let finalStatus = status;

    if (finalStatus === "completed") {
      const [campaignRows] = await connection.query(
        "SELECT id, remaining_budget FROM campaigns WHERE id = ? LIMIT 1 FOR UPDATE",
        [booking.campaign_id]
      );
      const campaign = campaignRows[0];
      const price = Number(booking.offered_price || 0);

      if (!campaign || Number(campaign.remaining_budget) < price) {
        // Rollback and release Connection A first to unlock the bookings table
        await connection.rollback();
        connection.release();
        released = true;

        // Insufficient budget! Generate PayOS link for this booking.
        const paymentService = require("./payment.service");
        const payAmount = price - (campaign ? Number(campaign.remaining_budget) : 0);

        const paymentLinkRes = await paymentService.createPaymentLink(
          booking.marketer_id,
          payAmount,
          `Pay booking #${id}`,
          id
        );

        return {
          requiresPayment: true,
          checkoutUrl: paymentLinkRes.checkoutUrl,
          amount: payAmount,
        };
      }

      // Deduct budget
      await connection.query(
        "UPDATE campaigns SET remaining_budget = remaining_budget - ? WHERE id = ?",
        [price, campaign.id]
      );
    }

    await connection.query(
      "UPDATE bookings SET status = ? WHERE id = ?",
      [finalStatus, id]
    );

    await connection.commit();
    
    const updated = await getBookingById(id);
    if (finalStatus === "completed") {
      await earningService.createEarningForBooking(updated);
    }
    return updated;
  } catch (err) {
    if (!released) {
      await connection.rollback();
    }
    throw err;
  } finally {
    if (!released) {
      connection.release();
    }
  }
}

module.exports = {
  mapBookingRow,
  getCampaignById,
  createBooking,
  listBookingsForUser,
  getBookingById,
  getKocBookingDetail,
  submitBookingSubmission,
  updateBookingContent,
  listMarketerSubmissions,
  reviewBookingSubmission,
  updateBookingStatus,
  updateVisibility,
};
