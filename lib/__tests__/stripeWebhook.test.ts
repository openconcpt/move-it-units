import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";

const sendBookingConfirmationEmailsMock = vi.fn(async () => {});
vi.mock("../bookingEmail", () => ({
  sendBookingConfirmationEmails: sendBookingConfirmationEmailsMock,
}));

const { handleStripeWebhookEvent } = await import("../stripeWebhook");

beforeEach(() => {
  sendBookingConfirmationEmailsMock.mockReset();
  sendBookingConfirmationEmailsMock.mockResolvedValue(undefined);
});

function uniqueConstraintError(target: string[] = ["id"]) {
  return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.22.0",
    meta: { target },
  });
}

interface FakePrismaOptions {
  processedEventCreateImpl?: () => Promise<unknown>;
  bookingUpdateImpl?: (args: { where: unknown; data: unknown }) => Promise<unknown>;
  txBookingUpdateImpl?: (args: { where: unknown; data: unknown }) => Promise<unknown>;
  txBookingUpdateManyImpl?: (args: { where: unknown; data: unknown }) => Promise<{ count: number }>;
}

function createFakePrisma(opts: FakePrismaOptions = {}) {
  const processedEventCreate = vi.fn(
    opts.processedEventCreateImpl ??
      (async () => ({ id: "evt_fake", type: "fake.event", processedAt: new Date() }))
  );

  // Used directly by the checkout.session.expired branch (no transaction).
  const bookingUpdate = vi.fn(
    opts.bookingUpdateImpl ?? (async ({ where, data }) => ({ id: "booking_1", where, ...data }))
  );

  // Used inside the $transaction callback by the checkout.session.completed
  // branch. Defaults to a fresh, never-emailed booking.
  const txBookingUpdate = vi.fn(
    opts.txBookingUpdateImpl ??
      (async ({ where, data }: { where: unknown; data: unknown }) => ({
        id: "booking_1",
        bookingRef: "MVU-TEST01",
        confirmationEmailSentAt: null,
        where,
        ...(data as object),
      }))
  );
  const txBookingUpdateMany = vi.fn(opts.txBookingUpdateManyImpl ?? (async () => ({ count: 1 })));

  const txBooking = { update: txBookingUpdate, updateMany: txBookingUpdateMany };
  const transaction = vi.fn(async (fn: (tx: { booking: typeof txBooking }) => unknown) =>
    fn({ booking: txBooking })
  );

  const prisma = {
    processedEvent: { create: processedEventCreate },
    booking: { update: bookingUpdate },
    $transaction: transaction,
  };

  return {
    prisma: prisma as unknown as PrismaClient,
    processedEventCreate,
    bookingUpdate,
    txBookingUpdate,
    txBookingUpdateMany,
    transaction,
  };
}

function createFakeStripe(paymentIntentImpl?: (id: string) => Promise<Partial<Stripe.PaymentIntent>>) {
  const retrieve = vi.fn(
    paymentIntentImpl ?? (async (id: string) => ({ id, payment_method: "pm_fake123" }))
  );
  const stripeClient = { paymentIntents: { retrieve } };
  return { stripeClient: stripeClient as unknown as Stripe, retrieve };
}

// Trimmed but structurally faithful Stripe webhook envelopes, matching what
// `stripe listen`/the Stripe CLI actually forwards for these event types.
function checkoutSessionCompletedFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1PXXTESTCOMPLETED0001",
    object: "event",
    api_version: "2024-06-20",
    created: 1717000000,
    type: "checkout.session.completed",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "cs_test_a1b2c3d4e5f6g7h8i9j0",
        object: "checkout.session",
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        customer: "cus_QABC123456",
        customer_email: "jane@example.com",
        payment_intent: "pi_3PXXXXXXXXXXXXXXXXXX",
        amount_total: 14900,
        currency: "usd",
        metadata: { bookingId: "booking_123", bookingRef: "MVU-7K2P9Q" },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

function checkoutSessionExpiredFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_1PXXTESTEXPIRED00001",
    object: "event",
    api_version: "2024-06-20",
    created: 1717000000,
    type: "checkout.session.expired",
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "cs_test_z9y8x7w6v5u4t3s2r1q0",
        object: "checkout.session",
        mode: "payment",
        status: "expired",
        payment_status: "unpaid",
        customer: "cus_QABC123456",
        customer_email: "jane@example.com",
        payment_intent: null,
        amount_total: 14900,
        currency: "usd",
        metadata: { bookingId: "booking_456", bookingRef: "MVU-9Z8Y7X" },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

describe("handleStripeWebhookEvent", () => {
  it("confirms the booking on checkout.session.completed, storing the payment intent and payment method", async () => {
    const event = checkoutSessionCompletedFixture();
    const { prisma, processedEventCreate, txBookingUpdate } = createFakePrisma();
    const { stripeClient, retrieve } = createFakeStripe(async (id) => ({
      id,
      payment_method: "pm_saved_card_1",
    }));

    const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(result.status).toBe(200);
    expect(processedEventCreate).toHaveBeenCalledWith({
      data: { id: event.id, type: "checkout.session.completed" },
    });
    expect(retrieve).toHaveBeenCalledWith("pi_3PXXXXXXXXXXXXXXXXXX");
    expect(txBookingUpdate).toHaveBeenCalledWith({
      where: { stripeSessionId: "cs_test_a1b2c3d4e5f6g7h8i9j0" },
      data: {
        status: "confirmed",
        expiresAt: null,
        stripePaymentIntentId: "pi_3PXXXXXXXXXXXXXXXXXX",
        stripePaymentMethodId: "pm_saved_card_1",
      },
      include: { package: true },
    });
  });

  it("handles a completed session whose payment intent has no attached payment method", async () => {
    const event = checkoutSessionCompletedFixture();
    const { prisma, txBookingUpdate } = createFakePrisma();
    const { stripeClient } = createFakeStripe(async (id) => ({ id, payment_method: null }));

    await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(txBookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripePaymentMethodId: null }) })
    );
  });

  it("cancels the booking on checkout.session.expired, without calling Stripe for payment intent details", async () => {
    const event = checkoutSessionExpiredFixture();
    const { prisma, processedEventCreate, bookingUpdate, transaction } = createFakePrisma();
    const { stripeClient, retrieve } = createFakeStripe();

    const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(result.status).toBe(200);
    expect(processedEventCreate).toHaveBeenCalledWith({
      data: { id: event.id, type: "checkout.session.expired" },
    });
    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { stripeSessionId: "cs_test_z9y8x7w6v5u4t3s2r1q0" },
      data: { status: "cancelled" },
    });
    expect(retrieve).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(sendBookingConfirmationEmailsMock).not.toHaveBeenCalled();
  });

  it("dedupes an already-processed event: returns 200 without touching the booking or sending email", async () => {
    const event = checkoutSessionCompletedFixture();
    const { prisma, transaction } = createFakePrisma({
      processedEventCreateImpl: async () => {
        throw uniqueConstraintError(["id"]);
      },
    });
    const { stripeClient, retrieve } = createFakeStripe();

    const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(result.status).toBe(200);
    expect(transaction).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
    expect(sendBookingConfirmationEmailsMock).not.toHaveBeenCalled();
  });

  it("records but no-ops on event types it doesn't explicitly handle", async () => {
    const event = {
      id: "evt_unhandled_type_001",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_irrelevant" } },
    } as unknown as Stripe.Event;
    const { prisma, processedEventCreate, transaction } = createFakePrisma();

    const { stripeClient } = createFakeStripe();
    const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(result.status).toBe(200);
    expect(processedEventCreate).toHaveBeenCalledWith({
      data: { id: event.id, type: "payment_intent.succeeded" },
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("propagates a non-dedupe database error instead of swallowing it", async () => {
    const event = checkoutSessionCompletedFixture();
    const { prisma } = createFakePrisma({
      processedEventCreateImpl: async () => {
        throw new Error("connection reset");
      },
    });
    const { stripeClient } = createFakeStripe();

    await expect(handleStripeWebhookEvent(prisma, stripeClient, event)).rejects.toThrow(
      "connection reset"
    );
  });

  describe("confirmation email idempotency", () => {
    it("sends the confirmation emails exactly once on first confirmation", async () => {
      const event = checkoutSessionCompletedFixture();
      const { prisma, txBookingUpdateMany } = createFakePrisma();
      const { stripeClient } = createFakeStripe();

      const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

      expect(result.status).toBe(200);
      // The claim runs inside the same transaction as the confirm update,
      // scoped to confirmationEmailSentAt still being null.
      expect(txBookingUpdateMany).toHaveBeenCalledWith({
        where: { id: "booking_1", confirmationEmailSentAt: null },
        data: { confirmationEmailSentAt: expect.any(Date) },
      });
      expect(sendBookingConfirmationEmailsMock).toHaveBeenCalledTimes(1);
      expect(sendBookingConfirmationEmailsMock).toHaveBeenCalledWith(
        prisma,
        expect.objectContaining({ id: "booking_1", bookingRef: "MVU-TEST01" }),
        14900 // session.amount_total
      );
    });

    it("does not send again when confirmationEmailSentAt was already claimed (defense in depth beyond the ProcessedEvent dedupe)", async () => {
      const event = checkoutSessionCompletedFixture();
      // The claim finds 0 matching rows: someone already set confirmationEmailSentAt.
      const { prisma } = createFakePrisma({ txBookingUpdateManyImpl: async () => ({ count: 0 }) });
      const { stripeClient } = createFakeStripe();

      const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

      expect(result.status).toBe(200);
      expect(sendBookingConfirmationEmailsMock).not.toHaveBeenCalled();
    });

    it("a failure sending confirmation emails still leaves the booking confirmed and the webhook returning 200", async () => {
      const event = checkoutSessionCompletedFixture();
      const { prisma, txBookingUpdate } = createFakePrisma();
      const { stripeClient } = createFakeStripe();
      sendBookingConfirmationEmailsMock.mockRejectedValueOnce(new Error("Resend is down"));

      const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

      expect(result.status).toBe(200);
      // The confirm update already happened (and committed) before the email
      // was ever attempted — it's unaffected by the email failing.
      expect(txBookingUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: "confirmed" }) })
      );
    });
  });
});
