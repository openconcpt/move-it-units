import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatCalendarDate, formatCents } from "@/lib/format";
import { ADD_ON_SLUGS, type AddOnSlug } from "@/lib/addOns";
import { BookingStatus } from "./BookingStatus";

interface BookingConfirmationPageProps {
  params: Promise<{ ref: string }>;
}

interface ReceiptLine {
  label: string;
  qty: number;
  amountCents: number;
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

  // Look up by slug regardless of `active` — a past booking may reference
  // an add-on that's since been deactivated, and its receipt must still
  // show what was actually purchased.
  const addOnRows = await prisma.addOn.findMany({
    where: {
      slug: { in: [ADD_ON_SLUGS.extraBins, ADD_ON_SLUGS.extraDolly, ADD_ON_SLUGS.blankets] },
    },
  });
  const addOnBySlug = new Map(addOnRows.map((a) => [a.slug as AddOnSlug, a]));

  const addOnQuantities: [AddOnSlug, number][] = [
    [ADD_ON_SLUGS.extraBins, booking.extraBinPacks],
    [ADD_ON_SLUGS.extraDolly, booking.extraDollies],
    [ADD_ON_SLUGS.blankets, booking.blanketPacks],
  ];

  const lines: ReceiptLine[] = [
    { label: booking.package.name, qty: 1, amountCents: booking.package.basePrice },
  ];

  for (const [slug, qty] of addOnQuantities) {
    if (qty <= 0) continue;
    const addOn = addOnBySlug.get(slug);
    lines.push({
      label: addOn?.name ?? slug,
      qty,
      amountCents: (addOn?.unitPrice ?? 0) * qty,
    });
  }

  const totalCents = lines.reduce((sum, line) => sum + line.amountCents, 0);

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
          amountCents={totalCents}
        />

        <div className="mt-8 rounded-2xl border border-line bg-surface p-5">
          <h2 className="font-display text-base font-bold">Order summary</h2>
          <div className="mt-3 flex flex-col gap-2">
            {lines.map((line) => (
              <div key={line.label} className="flex items-baseline justify-between text-sm">
                <span>
                  {line.label}
                  {line.qty > 1 ? ` × ${line.qty}` : ""}
                </span>
                <span className="tabular-nums text-muted">{formatCents(line.amountCents)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-semibold">Total</span>
            <span className="font-display text-xl font-extrabold tabular-nums">
              {formatCents(totalCents)}
            </span>
          </div>
        </div>

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
