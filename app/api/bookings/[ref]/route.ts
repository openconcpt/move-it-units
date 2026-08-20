import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// Deliberately minimal: this is polled client-side by the confirmation page
// to detect the pending -> confirmed transition, and a bookingRef isn't a
// secret, so it returns status only — no customer details.
export async function GET(_request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params;

  const booking = await prisma.booking.findUnique({
    where: { bookingRef: ref },
    select: { status: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  return NextResponse.json({ status: booking.status });
}
