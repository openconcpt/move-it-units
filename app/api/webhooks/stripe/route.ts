import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { stripe } from "@/lib/stripe";
import { handleStripeWebhookEvent } from "@/lib/stripeWebhook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }
  if (!webhookSecret) {
    console.error("STRIPE_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook not configured" }, { status: 500 });
  }

  // Signature verification requires the exact raw request body, so this
  // route must not parse JSON before verifying.
  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Stripe webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const result = await handleStripeWebhookEvent(prisma, stripe, event);
    return NextResponse.json({ received: true }, { status: result.status });
  } catch (err) {
    console.error(`Failed to handle Stripe webhook event ${event.id} (${event.type})`, err);
    return NextResponse.json({ error: "Webhook handler failed" }, { status: 500 });
  }
}
