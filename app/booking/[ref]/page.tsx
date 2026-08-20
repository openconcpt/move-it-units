import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCalendarDate } from "@/lib/format";
import { BookingStatus } from "./BookingStatus";

interface BookingConfirmationPageProps {
  params: Promise<{ ref: string }>;
}

export default async function BookingConfirmationPage({ params }: BookingConfirmationPageProps) {
  const { ref } = await params;

  const booking = await prisma.booking.findUnique({
    where: { bookingRef: ref },
    include: { package: true },
  });

  if (!booking) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-content px-5 py-12 sm:px-8 sm:py-16">
      <div className="max-w-xl">
        <p className="font-mono text-sm tabular-nums text-muted">{booking.bookingRef}</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          {booking.package.name}
        </h1>

        <BookingStatus
          bookingRef={booking.bookingRef}
          initialStatus={booking.status}
          amountCents={booking.package.basePrice}
        />

        <dl className="mt-8 divide-y divide-line border-t border-line">
          <Row label="Delivery date" value={formatCalendarDate(booking.deliveryDate)} />
          <Row label="Pickup date" value={formatCalendarDate(booking.pickupDate)} />
          <Row label="Delivery address" value={booking.deliveryAddress} />
          <Row label="Pickup address" value={booking.pickupAddress} />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-4 sm:flex-row sm:justify-between">
      <dt className="text-sm font-medium text-muted">{label}</dt>
      <dd className="text-sm font-medium sm:text-right">{value}</dd>
    </div>
  );
}
