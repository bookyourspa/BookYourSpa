import { z } from "zod";
import { handler, parseBody } from "@/lib/api";
import { payBooking } from "@/lib/payments";
import { loadBooking } from "@/lib/booking-queries";

const paySchema = z.object({
  method: z.enum(["card", "qris", "bank_transfer", "wallet", "cash"]),
  paymentToken: z.string().max(200).optional(),
});

/** POST /api/bookings/[ref]/pay — capture payment and confirm the booking. */
export const POST = handler({ auth: "customer:book", rateLimit: "pay" }, async (req, { params, user }) => {
  const body = await parseBody(req, paySchema);
  const b = loadBooking(params.ref, user!);
  const { payment, booking } = await payBooking({
    bookingId: b.id,
    method: body.method,
    paymentToken: body.paymentToken,
  });
  return { payment, booking };
});
