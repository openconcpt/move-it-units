import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkPackageAvailability } from "@/lib/availability";
import { generateBookingRef } from "@/lib/bookingRef";
import { stripe, getOrCreateStripeCustomer } from "@/lib/stripe";
import { isZipInServiceArea, normalizeZip, SERVICE_AREA_CONTACT_EMAIL } from "@/lib/serviceArea";

export const runtime = "nodejs";

const createBookingSchema = z
  .object({
    packageId: z.string().min(1, "packageId is required"),
    customerName: z.string().trim().min(1).max(200),
    customerEmail: z.string().trim().email(),
    customerPhone: z.string().trim().min(7).max(20),
    deliveryAddress: z.string().trim().min(1).max(500),
    pickupAddress: z.string().trim().min(1).max(500),
    deliveryZip: z.string().trim().refine((v) => normalizeZip(v) !== null, {
      message: "deliveryZip must be a valid 5-digit ZIP code",
    }),
    pickupZip: z.string().trim().refine((v) => normalizeZip(v) !== null, {
      message: "pickupZip must be a valid 5-digit ZIP code",
    }),
    deliveryDate: z.coerce.date(),
    pickupDate: z.coerce.date(),
  })
  .refine((data) => data.pickupDate.getTime() >= data.deliveryDate.getTime(), {
    message: "pickupDate cannot be before deliveryDate",
    path: ["pickupDate"],
  });

class AvailabilityConflictError extends Error {}

const MAX_ATTEMPTS = 3;
const PENDING_BOOKING_TTL_MINUTES = 30;
const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

type BookingWithPackage = Prisma.BookingGetPayload<{ include: { package: true } }>;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const input = parsed.data;

  const outOfAreaField = !isZipInServiceArea(input.deliveryZip)
    ? "delivery"
    : !isZipInServiceArea(input.pickupZip)
      ? "pickup"
      : null;

  if (outOfAreaField) {
    return NextResponse.json(
      {
        error: `We don't deliver to that ${outOfAreaField} ZIP code yet. Email ${SERVICE_AREA_CONTACT_EMAIL} and we'll let you know if we can make an exception.`,
      },
      { status: 422 }
    );
  }

  let booking: BookingWithPackage | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      booking = await prisma.$transaction(
        async (tx) => {
          const availability = await checkPackageAvailability(tx, {
            packageId: input.packageId,
            deliveryDate: input.deliveryDate,
            pickupDate: input.pickupDate,
          });

          if (!availability.available) {
            throw new AvailabilityConflictError(
              availability.reason ?? "Requested dates are not available"
            );
          }

          return tx.booking.create({
            data: {
              bookingRef: generateBookingRef(),
              packageId: input.packageId,
              customerName: input.customerName,
              customerEmail: input.customerEmail,
              customerPhone: input.customerPhone,
              deliveryAddress: input.deliveryAddress,
              pickupAddress: input.pickupAddress,
              deliveryDate: input.deliveryDate,
              pickupDate: input.pickupDate,
              status: "pending",
              expiresAt: new Date(Date.now() + PENDING_BOOKING_TTL_MINUTES * 60 * 1000),
            },
            include: { package: true },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      break;
    } catch (err) {
      if (err instanceof AvailabilityConflictError) {
        return NextResponse.json({ error: err.message }, { status: 409 });
      }

      const isRetryable =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        // P2034: write conflict / serialization failure under concurrent load.
        // P2002 on bookingRef: extremely unlikely random-code collision.
        (err.code === "P2034" ||
          (err.code === "P2002" &&
            (err.meta?.target as string[] | undefined)?.includes("bookingRef")));

      if (isRetryable && attempt < MAX_ATTEMPTS) {
        continue;
      }

      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2025"
      ) {
        return NextResponse.json({ error: "Package not found" }, { status: 404 });
      }

      console.error("Failed to create booking", err);
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }
  }

  if (!booking) {
    return NextResponse.json(
      { error: "Could not create booking due to concurrent demand, please try again" },
      { status: 409 }
    );
  }

  // The pending booking now exists and is already accounted for by
  // availability checks. Everything below is external Stripe I/O: if any of
  // it fails, we deliberately do NOT roll back the booking — it just stays
  // "pending" and will expire on its own (see PENDING_BOOKING_TTL_MINUTES),
  // naturally freeing the inventory it briefly held.
  try {
    const customer = await getOrCreateStripeCustomer(
      stripe,
      booking.customerEmail,
      booking.customerName
    );

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customer.id,
      payment_intent_data: {
        setup_future_usage: "off_session",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: { name: booking.package.name },
            unit_amount: booking.package.basePrice,
          },
          quantity: 1,
        },
      ],
      metadata: {
        bookingId: booking.id,
        bookingRef: booking.bookingRef,
      },
      success_url: `${APP_URL}/booking/${booking.bookingRef}`,
      cancel_url: `${APP_URL}/book`,
      // Computed independently (not reused from booking.expiresAt): Stripe
      // requires this to be >= 30 minutes from ITS OWN creation timestamp,
      // which is a moment later than when we set booking.expiresAt above.
      // Padded by a minute so we don't risk landing under Stripe's minimum
      // due to the processing delay between the two timestamps.
      expires_at: Math.floor(Date.now() / 1000) + (PENDING_BOOKING_TTL_MINUTES + 1) * 60,
    });

    const updatedBooking = await prisma.booking.update({
      where: { id: booking.id },
      data: {
        stripeCustomerId: customer.id,
        stripeSessionId: checkoutSession.id,
      },
    });

    return NextResponse.json(
      { booking: updatedBooking, checkoutUrl: checkoutSession.url },
      { status: 201 }
    );
  } catch (err) {
    console.error(`Failed to start Stripe checkout for booking ${booking.bookingRef}`, err);
    return NextResponse.json(
      {
        error:
          "Booking created but payment could not be started. It will automatically expire and free up inventory; please try again.",
        bookingRef: booking.bookingRef,
      },
      { status: 502 }
    );
  }
}
