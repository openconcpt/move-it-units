import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { checkPackageAvailability } from "@/lib/availability";

export const runtime = "nodejs";

const querySchema = z
  .object({
    packageId: z.string().min(1, "packageId is required"),
    deliveryDate: z.coerce.date(),
    pickupDate: z.coerce.date(),
  })
  .refine((data) => data.pickupDate.getTime() >= data.deliveryDate.getTime(), {
    message: "pickupDate cannot be before deliveryDate",
    path: ["pickupDate"],
  });

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const parsed = querySchema.safeParse({
    packageId: searchParams.get("packageId"),
    deliveryDate: searchParams.get("deliveryDate"),
    pickupDate: searchParams.get("pickupDate"),
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { packageId, deliveryDate, pickupDate } = parsed.data;

  try {
    const result = await checkPackageAvailability(prisma, {
      packageId,
      deliveryDate,
      pickupDate,
    });

    return NextResponse.json({ available: result.available, reason: result.reason });
  } catch (err) {
    console.error("Failed to check availability", err);
    return NextResponse.json({ error: "Failed to check availability" }, { status: 500 });
  }
}
