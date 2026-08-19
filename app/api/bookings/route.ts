import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkPackageAvailability } from "@/lib/availability";
import { generateBookingRef } from "@/lib/bookingRef";

export const runtime = "nodejs";

const createBookingSchema = z
  .object({
    packageId: z.string().min(1, "packageId is required"),
    customerName: z.string().trim().min(1).max(200),
    customerEmail: z.string().trim().email(),
    customerPhone: z.string().trim().min(7).max(20),
    deliveryAddress: z.string().trim().min(1).max(500),
    pickupAddress: z.string().trim().min(1).max(500),
    deliveryDate: z.coerce.date(),
    pickupDate: z.coerce.date(),
  })
  .refine((data) => data.pickupDate.getTime() >= data.deliveryDate.getTime(), {
    message: "pickupDate cannot be before deliveryDate",
    path: ["pickupDate"],
  });

class AvailabilityConflictError extends Error {}

const MAX_ATTEMPTS = 3;

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

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const booking = await prisma.$transaction(
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
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

      return NextResponse.json({ booking }, { status: 201 });
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

  return NextResponse.json(
    { error: "Could not create booking due to concurrent demand, please try again" },
    { status: 409 }
  );
}
