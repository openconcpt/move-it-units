import { beforeEach, describe, expect, it, vi } from "vitest";
import { SERVICE_AREA_CONTACT_EMAIL, SERVICE_AREA_ZIPS } from "@/lib/serviceArea";

const findUniquePackage = vi.fn();
const findUniqueInventoryConfig = vi.fn();
const findManyBooking = vi.fn();
const findManyAddOn = vi.fn();
const createBooking = vi.fn();
const updateBooking = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...args),
    booking: { update: (...args: unknown[]) => updateBooking(...args) },
    addOn: { findMany: (...args: unknown[]) => findManyAddOn(...args) },
  },
}));

const getOrCreateStripeCustomer = vi.fn();
const createCheckoutSession = vi.fn();

vi.mock("@/lib/stripe", () => ({
  stripe: {
    checkout: { sessions: { create: (...args: unknown[]) => createCheckoutSession(...args) } },
  },
  getOrCreateStripeCustomer: (...args: unknown[]) => getOrCreateStripeCustomer(...args),
}));

const { POST } = await import("../route");

const IN_AREA_ZIP = SERVICE_AREA_ZIPS[0];
const OUT_OF_AREA_ZIP = "00501"; // a real ZIP format, guaranteed absent from the allowlist

const ADD_ON_CATALOG = [
  {
    id: "addon_bins",
    slug: "extra-bins",
    name: "Extra bin pack",
    unitPrice: 2900,
    binsPerUnit: 10,
    dolliesPerUnit: 0,
    blanketsPerUnit: 0,
    active: true,
  },
  {
    id: "addon_dolly",
    slug: "extra-dolly",
    name: "Extra dolly",
    unitPrice: 1900,
    binsPerUnit: 0,
    dolliesPerUnit: 1,
    blanketsPerUnit: 0,
    active: true,
  },
  {
    id: "addon_blankets",
    slug: "blankets",
    name: "Blanket pack",
    unitPrice: 2500,
    binsPerUnit: 0,
    dolliesPerUnit: 0,
    blanketsPerUnit: 6,
    active: false, // matches the real seed: we don't own any yet
  },
];

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    packageId: "pkg_1",
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "555-123-4567",
    deliveryAddress: `123 Main St, ${IN_AREA_ZIP}`,
    pickupAddress: `123 Main St, ${IN_AREA_ZIP}`,
    deliveryZip: IN_AREA_ZIP,
    pickupZip: IN_AREA_ZIP,
    deliveryDate: "2026-09-01",
    pickupDate: "2026-09-05",
    ...overrides,
  };
}

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/bookings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const txMock = {
  package: { findUnique: (...args: unknown[]) => findUniquePackage(...args) },
  inventoryConfig: { findUnique: (...args: unknown[]) => findUniqueInventoryConfig(...args) },
  booking: {
    findMany: (...args: unknown[]) => findManyBooking(...args),
    create: (...args: unknown[]) => createBooking(...args),
  },
  addOn: { findMany: (...args: unknown[]) => findManyAddOn(...args) },
};

beforeEach(() => {
  findUniquePackage.mockReset();
  findUniqueInventoryConfig.mockReset();
  findManyBooking.mockReset();
  findManyAddOn.mockReset();
  createBooking.mockReset();
  updateBooking.mockReset();
  transaction.mockReset();
  getOrCreateStripeCustomer.mockReset();
  createCheckoutSession.mockReset();

  transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));

  // Generous capacity + no conflicts by default; individual tests override
  // to exercise the unavailable/out-of-area/add-on paths.
  findUniquePackage.mockResolvedValue({
    id: "pkg_1",
    active: true,
    name: "Studio/1BR",
    binCount: 20,
    dollyCount: 1,
    basePrice: 14900,
  });
  findUniqueInventoryConfig.mockResolvedValue({
    id: 1,
    totalBins: 100,
    totalDollies: 5,
    totalBlankets: 6,
  });
  findManyBooking.mockResolvedValue([]);
  findManyAddOn.mockResolvedValue(ADD_ON_CATALOG);
  createBooking.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "booking_1",
    bookingRef: "MVU-TEST01",
    customerEmail: "jane@example.com",
    customerName: "Jane Doe",
    package: { id: "pkg_1", name: "Studio/1BR", basePrice: 14900 },
    ...data,
  }));
  getOrCreateStripeCustomer.mockResolvedValue({ id: "cus_test" });
  createCheckoutSession.mockResolvedValue({
    id: "cs_test_1",
    url: "https://checkout.stripe.com/pay/cs_test_1",
  });
  updateBooking.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    id: "booking_1",
    bookingRef: "MVU-TEST01",
    ...data,
  }));
});

describe("POST /api/bookings — ZIP validation", () => {
  it("returns 422 with a friendly message when the delivery ZIP is out of the service area", async () => {
    const res = await POST(makeRequest(validBody({ deliveryZip: OUT_OF_AREA_ZIP })));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toContain("delivery ZIP");
    expect(body.error).toContain(SERVICE_AREA_CONTACT_EMAIL);
    expect(transaction).not.toHaveBeenCalled();
    expect(getOrCreateStripeCustomer).not.toHaveBeenCalled();
  });

  it("returns 422 when the pickup ZIP is out of the service area", async () => {
    const res = await POST(makeRequest(validBody({ pickupZip: OUT_OF_AREA_ZIP })));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toContain("pickup ZIP");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("returns 400 (not 422) for a malformed ZIP", async () => {
    const res = await POST(makeRequest(validBody({ deliveryZip: "not-a-zip" })));
    expect(res.status).toBe(400);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("422 is distinct from the 409 returned for unavailable dates", async () => {
    // Valid ZIPs, but no capacity at all — should fail availability (409),
    // never touching the ZIP gate's error path.
    findUniqueInventoryConfig.mockResolvedValue({ id: 1, totalBins: 0, totalDollies: 0, totalBlankets: 0 });

    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).not.toContain("ZIP");
  });

  it("proceeds to create a booking and checkout session when both ZIPs are in area", async () => {
    const res = await POST(makeRequest(validBody()));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/pay/cs_test_1");
    expect(createBooking).toHaveBeenCalledTimes(1);
    expect(getOrCreateStripeCustomer).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/bookings — add-ons", () => {
  it("rejects a request for an inactive add-on (blankets) with 422, before touching the DB", async () => {
    const res = await POST(makeRequest(validBody({ blanketPacks: 1 })));
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.error).toContain("Blanket pack");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a request referencing an add-on missing from the catalog entirely", async () => {
    findManyAddOn.mockResolvedValue(
      ADD_ON_CATALOG.filter((a) => a.slug !== "extra-dolly")
    );

    const res = await POST(makeRequest(validBody({ extraDollies: 1 })));
    expect(res.status).toBe(422);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("ignores zero-quantity add-ons even if inactive", async () => {
    const res = await POST(makeRequest(validBody({ blanketPacks: 0 })));
    expect(res.status).toBe(201);
  });

  it("stores add-on quantities on the created booking and passes them to availability", async () => {
    const res = await POST(makeRequest(validBody({ extraBinPacks: 2, extraDollies: 1 })));
    expect(res.status).toBe(201);

    expect(createBooking).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ extraBinPacks: 2, extraDollies: 1, blanketPacks: 0 }),
      })
    );
  });

  it("builds a separate Stripe line item per requested add-on, omitting zero-quantity ones", async () => {
    const res = await POST(makeRequest(validBody({ extraBinPacks: 2, extraDollies: 1 })));
    expect(res.status).toBe(201);

    expect(createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({ unit_amount: 14900 }),
          }),
          expect.objectContaining({
            quantity: 2,
            price_data: expect.objectContaining({
              unit_amount: 2900,
              product_data: expect.objectContaining({ name: "Extra bin pack" }),
            }),
          }),
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({
              unit_amount: 1900,
              product_data: expect.objectContaining({ name: "Extra dolly" }),
            }),
          }),
        ],
      })
    );
  });

  it("the critical case: extra bins that push demand over capacity flow through to a 409, not a successful booking", async () => {
    // Package alone (20 bins) exactly fits 20 total bins. +1 extra-bin-pack
    // (10 more) must be rejected, not silently oversold.
    findUniqueInventoryConfig.mockResolvedValue({
      id: 1,
      totalBins: 20,
      totalDollies: 5,
      totalBlankets: 6,
    });

    const res = await POST(makeRequest(validBody({ extraBinPacks: 1 })));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error).toContain("bins");
    expect(createBooking).not.toHaveBeenCalled();
  });
});
