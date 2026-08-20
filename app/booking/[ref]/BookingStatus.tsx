"use client";

import { useEffect, useState } from "react";
import { formatCents } from "@/lib/format";

type Status = "pending" | "confirmed" | "delivered" | "returned" | "cancelled";

interface BookingStatusProps {
  bookingRef: string;
  initialStatus: Status;
  amountCents: number;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

export function BookingStatus({ bookingRef, initialStatus, amountCents }: BookingStatusProps) {
  const [status, setStatus] = useState<Status>(initialStatus);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (status !== "pending") return;

    const startedAt = Date.now();

    const intervalId = setInterval(async () => {
      if (Date.now() - startedAt >= POLL_TIMEOUT_MS) {
        setTimedOut(true);
        clearInterval(intervalId);
        return;
      }

      try {
        const res = await fetch(`/api/bookings/${bookingRef}`);
        if (!res.ok) return;
        const body = await res.json();
        if (body.status && body.status !== "pending") {
          setStatus(body.status);
          clearInterval(intervalId);
        }
      } catch {
        // Transient network error — the interval just tries again.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [status, bookingRef]);

  if (status === "pending") {
    return (
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold">{timedOut ? "Still processing" : "Confirming your payment…"}</p>
        <p className="mt-1 text-sm text-muted">
          {timedOut
            ? "This is taking longer than usual. Refresh this page in a minute — if it's still pending after that, contact us with your booking reference."
            : "This usually takes a few seconds. Hang tight."}
        </p>
      </div>
    );
  }

  if (status === "cancelled") {
    return (
      <div className="mt-6 rounded-2xl border border-line bg-surface p-5">
        <p className="font-semibold text-danger">Checkout wasn&apos;t completed</p>
        <p className="mt-1 text-sm text-muted">
          This booking was cancelled and the dates were released. You can book again anytime.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-6 rounded-2xl border border-accent bg-accent-soft p-5">
      <div className="flex items-baseline justify-between">
        <span className="font-semibold text-accent-ink">Payment confirmed</span>
        <span className="font-display text-2xl font-extrabold tabular-nums text-accent-ink">
          {formatCents(amountCents)}
        </span>
      </div>
      <p className="mt-2 text-sm text-accent-ink">
        Your card is saved on file for extension days or a replacement fee, if needed.
      </p>
    </div>
  );
}
