import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { sendBookingConfirmationEmails } from "./bookingEmail";

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

    // Confirming the booking and claiming the right to send its one
    // confirmation email happen in the same transaction: the claim is a
    // conditional update (only when confirmationEmailSentAt is still null)
    // so a booking can never end up with two confirmation emails, even if
    // this code path is ever reached more than once for the same booking
    // (the ProcessedEvent dedupe above already prevents that for retries of
    // the *same* Stripe event — this is a second, independent guard).
    const { booking, shouldSendEmail } = await prisma.$transaction(
      async (tx) => {
        const updated = await tx.booking.update({
          where: { stripeSessionId: session.id },
          data: {
            status: "confirmed",
            expiresAt: null,
            stripePaymentIntentId: paymentIntentId,
            stripePaymentMethodId: paymentMethodId,
          },
          include: { package: true },
        });

        const claim = await tx.booking.updateMany({
          where: { id: updated.id, confirmationEmailSentAt: null },
          data: { confirmationEmailSentAt: new Date() },
        });

        return { booking: updated, shouldSendEmail: claim.count === 1 };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );

    // Deliberately outside the transaction and never allowed to throw: a
    // failed email must never fail the webhook or roll back the booking,
    // which is already committed by this point.
    if (shouldSendEmail) {
      await sendBookingConfirmationEmails(prisma, booking, session.amount_total ?? 0).catch((err) => {
        console.error(`Unexpected error sending confirmation emails for booking ${booking.bookingRef}`, err);
      });
    }
  } else if (event.type === "checkout.session.expired") {
    const session = event.data.object as Stripe.Checkout.Session;

    await prisma.booking.update({
      where: { stripeSessionId: session.id },
      data: { status: "cancelled" },
    });
  }

  return { status: 200 };
}
