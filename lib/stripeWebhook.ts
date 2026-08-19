import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";

export interface StripeWebhookResult {
  status: number;
}

function isUniqueConstraintViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

function extractPaymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (!session.payment_intent) return null;
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : session.payment_intent.id;
}

function extractPaymentMethodId(paymentIntent: Stripe.PaymentIntent): string | null {
  if (!paymentIntent.payment_method) return null;
  return typeof paymentIntent.payment_method === "string"
    ? paymentIntent.payment_method
    : paymentIntent.payment_method.id;
}

/**
 * Applies a verified Stripe webhook event.
 *
 * Dedupe strategy: insert the event id into ProcessedEvent *first*, using its
 * unique constraint as an atomic idempotency gate. Stripe delivers webhooks
 * at-least-once, so concurrent/duplicate deliveries of the same event race
 * on that insert — exactly one wins and proceeds to mutate the booking; the
 * rest see a unique-constraint violation and return early having done
 * nothing. This must happen before any booking mutation (not after), or two
 * concurrent duplicates could both pass a "not yet processed" check and both
 * apply the side effect.
 */
export async function handleStripeWebhookEvent(
  prisma: PrismaClient,
  stripeClient: Stripe,
  event: Stripe.Event
): Promise<StripeWebhookResult> {
  try {
    await prisma.processedEvent.create({
      data: { id: event.id, type: event.type },
    });
  } catch (err) {
    if (isUniqueConstraintViolation(err)) {
      return { status: 200 };
    }
    throw err;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const paymentIntentId = extractPaymentIntentId(session);

    let paymentMethodId: string | null = null;
    if (paymentIntentId) {
      const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);
      paymentMethodId = extractPaymentMethodId(paymentIntent);
    }

    await prisma.booking.update({
      where: { stripeSessionId: session.id },
      data: {
        status: "confirmed",
        expiresAt: null,
        stripePaymentIntentId: paymentIntentId,
        stripePaymentMethodId: paymentMethodId,
      },
    });
  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;

    await prisma.booking.update({
      where: { stripeSessionId: session.id },
      data: { status: "cancelled" },
    });
  }

  return { status: 200 };
}
