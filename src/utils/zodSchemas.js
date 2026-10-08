const { z } = require('zod');

// --- Campaign Schemas ---

const campaignBaseSchema = z.object({
  title: z.string().min(5, "Tiêu đề phải ít nhất 5 ký tự").max(200),
  description: z.string().min(20, "Mô tả phải ít nhất 20 ký tự"),
  category: z.string().min(1, "Vui lòng chọn lĩnh vực"),
  platform: z.string().min(1, "Vui lòng chọn nền tảng"),
  budget: z.coerce.number().positive("Ngân sách phải lớn hơn 0"),
  start_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Ngày bắt đầu không hợp lệ"),
  end_date: z.string().refine((val) => !isNaN(Date.parse(val)), "Ngày kết thúc không hợp lệ"),
  status: z.enum(['draft', 'scheduled', 'open', 'paused', 'in_progress', 'completed', 'cancelled', 'pending_payment']).optional(),
  target_followers_min: z.coerce.number().nonnegative().optional(),
  target_engagement_min: z.coerce.number().nonnegative().optional(),
  product_name: z.string().max(255).optional().nullable(),
  product_description: z.string().optional().nullable(),
  product_images: z.array(z.string()).optional().nullable(),
});

const campaignCreateSchema = campaignBaseSchema.refine((data) => new Date(data.end_date) > new Date(data.start_date), {
  message: "Ngày kết thúc phải sau ngày bắt đầu",
  path: ["end_date"],
});

const campaignUpdateSchema = campaignBaseSchema.partial().extend({
  status: z.enum(['draft', 'scheduled', 'open', 'paused', 'in_progress', 'completed', 'cancelled', 'pending_payment']).optional(),
});

// --- Booking Schemas ---

const bookingCreateSchema = z.object({
  campaignId: z.coerce.number().int().positive(),
  kocId: z.coerce.number().int().positive().optional(),
  direction: z.enum(['marketer_invited', 'koc_applied']),
  offeredPrice: z.coerce.number().nonnegative().optional(), // Allow 0 or optional
  note: z.string().max(1000).optional(),
  estimatedDeliveryDays: z.coerce.number().int().positive().optional(),
  sampleLink: z.string().url("Link không hợp lệ").or(z.literal("")).optional(),
});

const bookingReviewSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'cancelled', 'completed', 'ready_to_connect', 'payment_rejected']),
});

const contentSubmissionSchema = z.object({
  draftLink: z.string().url("Link bản thảo không hợp lệ").or(z.literal("")).optional(),
  finalLink: z.string().url("Link chính thức không hợp lệ").or(z.literal("")).optional(),
});

module.exports = {
  campaignCreateSchema,
  campaignUpdateSchema,
  bookingCreateSchema,
  bookingReviewSchema,
  contentSubmissionSchema,
};
