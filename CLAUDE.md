@AGENTS.md

# Move It Units

Booking site for a moving-bin rental service in Palm Beach County, FL. Customers rent gray
plastic totes with dollies and write-on tags, delivered and picked up on scheduled dates.

## Stack

Next 15 (app router) · TypeScript strict · Tailwind v3 · Prisma against Supabase Postgres ·
Stripe Checkout · Resend · Vercel · vitest.

## Conventions that aren't obvious from reading one file

**Two different day counts, on purpose.** `lib/pricing.ts`'s `computeExtensionPricing` bills
rental days as `pickupDate − deliveryDate` (hotel-nights style: delivery Mon → pickup the next
Mon = 7 days, zero extension). `lib/availability.ts`'s `getOccupiedDateRange` reserves capacity
*inclusive* of both endpoints, plus a 1-day turnaround buffer — the bins are physically out on
the pickup date too. These deliberately disagree; don't "fix" one to match the other (see the
comment on `computeExtensionPricing`).

**Pricing is server-authoritative.** `app/api/bookings/route.ts` computes the total from the
submitted dates via `computeExtensionPricing`. The request schema has no `total` field, so
anything a client sends under that name is silently dropped by zod before the handler ever sees
it. `BookingForm.tsx` calls the same shared function client-side, but only as a preview.

**Two independent idempotency guards on the Stripe webhook** (`lib/stripeWebhook.ts`).
`ProcessedEvent` dedupes by Stripe event id — an insert racing on a unique constraint. Separately,
`Booking.confirmationEmailSentAt` is claimed via a conditional `updateMany`, in the same
transaction that marks the booking confirmed, so a booking can't end up with two confirmation
emails even if that code path is ever reached twice for the same booking.

**Resend doesn't throw on API-level failures.** `resend.emails.send()` resolves
`{ data: null, error }` for things like an invalid address; only network failures actually
reject the promise. `lib/bookingEmail.ts` (`logIfFailed`) checks both — a bare `try/catch` would
miss the first.

**`labelCount` is customer-facing as "tags."** The field name is legacy (the product used to
ship adhesive labels); renaming the column isn't worth a migration for a wording change. All
customer-facing copy says "tags" — don't reintroduce "labels" in new UI text.

**Colors are tokens, never hex.** `accent` / `accent-ink` / `accent-soft` (plus `structural` /
`structural-soft`, `paper`, `ink`, `muted`, `line`, `danger`) are defined once as CSS vars in
`app/globals.css` and surfaced through `tailwind.config.ts`. Nothing outside those two files
hardcodes a hex.

**Layout tokens**: `max-w-container` (1120px) and `max-w-prose` (720px), section rhythm 64px
(mobile) / 96px (`md:`+) — used consistently on the landing page. `/book` and the booking
confirmation page still use the older `max-w-content` (1152px, kept as its own Tailwind token);
they haven't been migrated to the newer scale yet.

## Known deferred issue

The checkout-hold/session-expiry gap is mostly closed, not wide open: `app/api/bookings/route.ts`
already sets the Stripe Checkout session's `expires_at` to match the booking's own 30-minute
hold (`PENDING_BOOKING_TTL_MINUTES`), padded by a minute since Stripe requires ≥30 min from the
session's own creation time. What's left is narrower: `lib/availability.ts` stops counting a
pending booking as holding inventory the instant `booking.expiresAt` passes, but nothing marks
that row `cancelled` until Stripe's `checkout.session.expired` webhook arrives roughly a minute
later — so there's a ~60-second window where a second customer can see the slot as free while
the first customer's session is technically still payable. A fix would tighten that gap (e.g.
re-check availability in `checkout.session.completed` and refund if it's been lost) rather than
add `expires_at`, which is already there. Only bites under concurrent demand on the same dates.
