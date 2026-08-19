import { describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { handleStripeWebhookEvent } from "../stripeWebhook";

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
}

function createFakePrisma(opts: FakePrismaOptions = {}) {
  const processedEventCreate = vi.fn(
    opts.processedEventCreateImpl ??
      (async () => ({ id: "evt_fake", type: "fake.event", processedAt: new Date() }))
  );
  const bookingUpdate = vi.fn(
    opts.bookingUpdateImpl ?? (async ({ where, data }) => ({ id: "booking_1", where, ...data }))
  );

  const prisma = {
    processedEvent: { create: processedEventCreate },
    booking: { update: bookingUpdate },
  };

  return { prisma: prisma as unknown as PrismaClient, processedEventCreate, bookingUpdate };
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
    const { prisma, processedEventCreate, bookingUpdate } = createFakePrisma();
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
    expect(bookingUpdate).toHaveBeenCalledWith({
      where: { stripeSessionId: "cs_test_a1b2c3d4e5f6g7h8i9j0" },
      data: {
        status: "confirmed",
        expiresAt: null,
        stripePaymentIntentId: "pi_3PXXXXXXXXXXXXXXXXXX",
        stripePaymentMethodId: "pm_saved_card_1",
      },
    });
  });

  it("handles a completed session whose payment intent has no attached payment method", async () => {
    const event = checkoutSessionCompletedFixture();
    const { prisma, bookingUpdate } = createFakePrisma();
    const { stripeClient } = createFakeStripe(async (id) => ({ id, payment_method: null }));

    await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(bookingUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ stripePaymentMethodId: null }) })
    );
  });

  it("cancels the booking on checkout.session.expired, without calling Stripe for payment intent details", async () => {
    const event = checkoutSessionExpiredFixture();
    const { prisma, processedEventCreate, bookingUpdate } = createFakePrisma();
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
  });

  it("dedupes an already-processed event: returns 200 without touching the booking", async () => {
    const event = checkoutSessionCompletedFixture();
    const { prisma, bookingUpdate } = createFakePrisma({
      processedEventCreateImpl: async () => {
        throw uniqueConstraintError(["id"]);
      },
    });
    const { stripeClient, retrieve } = createFakeStripe();

    const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(result.status).toBe(200);
    expect(bookingUpdate).not.toHaveBeenCalled();
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("records but no-ops on event types it doesn't explicitly handle", async () => {
    const event = {
      id: "evt_unhandled_type_001",
      object: "event",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_irrelevant" } },
    } as unknown as Stripe.Event;
    const { prisma, processedEventCreate, bookingUpdate } = createFakePrisma();

    const { stripeClient } = createFakeStripe();
    const result = await handleStripeWebhookEvent(prisma, stripeClient, event);

    expect(result.status).toBe(200);
    expect(processedEventCreate).toHaveBeenCalledWith({
      data: { id: event.id, type: "payment_intent.succeeded" },
    });
    expect(bookingUpdate).not.toHaveBeenCalled();
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
});
