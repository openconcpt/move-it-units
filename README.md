# moveitunits

Moving bin rental booking system. Next.js 15 (app router) + TypeScript + Tailwind v3 + Prisma + Supabase Postgres + Stripe Checkout (test mode). No UI yet — this is the data layer, availability logic, and booking/payment API.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` / `DIRECT_URL` — your Supabase Postgres connection strings
   - `STRIPE_SECRET_KEY` / `STRIPE_PUBLISHABLE_KEY` — from the [Stripe test-mode API keys page](https://dashboard.stripe.com/test/apikeys)
   - `STRIPE_WEBHOOK_SECRET` — see [Stripe webhooks locally](#stripe-webhooks-locally) below
   - `APP_URL` — defaults to `http://localhost:3000`, used to build Checkout success/cancel redirect URLs

3. Apply the schema and seed data:

   ```bash
   npx prisma migrate dev --name init
   npm run prisma:seed
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

## Stripe webhooks locally

Stripe needs to reach `/api/webhooks/stripe` to deliver events (`checkout.session.completed`, `checkout.session.expired`). Locally, forward them through the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

The first time you run this, `stripe listen` prints a webhook signing secret (`whsec_...`) — copy it into `STRIPE_WEBHOOK_SECRET` in `.env` (or fetch it non-interactively with `stripe listen --print-secret`). Leave `stripe listen` running in a separate terminal alongside `npm run dev` while testing the booking flow.

To trigger a specific event manually for testing:

```bash
stripe trigger checkout.session.completed
```

In production, create a webhook endpoint in the Stripe Dashboard pointing at `https://<your-domain>/api/webhooks/stripe` and use its signing secret instead.

## Booking + payment flow

1. `POST /api/bookings` validates input, re-checks availability inside a serializable transaction, and creates a `pending` booking with `expiresAt` 30 minutes out.
2. It then creates (or reuses) a Stripe Customer by email and a Checkout Session (`mode=payment`, amount = package `basePrice`, `payment_intent_data.setup_future_usage=off_session` so the card is saved for later extension/replacement charges), and returns `{ booking, checkoutUrl }`.
3. If Stripe fails after the booking row is created, the booking is left as `pending` rather than rolled back — it self-expires and frees its inventory automatically, so nothing needs manual cleanup.
4. The Stripe webhook confirms or cancels the booking based on whether checkout completed or expired.

### Why `expiresAt`

A `pending` booking holds inventory (see `lib/availability.ts`) only until `expiresAt`. Without this, an abandoned checkout (customer closes the tab) would hold bins/dollies forever. Confirmed bookings have `expiresAt` cleared and hold inventory unconditionally.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm test` — run the vitest suite once
- `npm run test:watch` — vitest in watch mode
- `npm run prisma:migrate` — `prisma migrate dev`
- `npm run prisma:seed` — seed packages + inventory config
