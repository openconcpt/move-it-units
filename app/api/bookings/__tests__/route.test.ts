import { beforeEach, describe, expect, it, vi } from "vitest";
import { SERVICE_AREA_ZIPS } from "@/lib/serviceArea";

const findUniquePackage = vi.fn();
const findUniqueInventoryConfig = vi.fn();
const findManyBooking = vi.fn();
const createBooking = vi.fn();
const updateBooking = vi.fn();
const transaction = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => transaction(...args),
    booking: { update: (...args: unknown[]) => updateBooking(...args) },
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
};

beforeEach(() => {
  findUniquePackage.mockReset();
  findUniqueInventoryConfig.mockReset();
  findManyBooking.mockReset();
  createBooking.mockReset();
  updateBooking.mockReset();
  transaction.mockReset();
  getOrCreateStripeCustomer.mockReset();
  createCheckoutSession.mockReset();

  transaction.mockImplementation(async (fn: (tx: typeof txMock) => unknown) => fn(txMock));

  // Generous capacity + no conflicts by default; individual tests override
  // to exercise the unavailable/out-of-area paths.
  findUniquePackage.mockResolvedValue({
    id: "pkg_1",
    active: true,
    name: "Studio/1BR",
    binCount: 20,
    dollyCount: 1,
    basePrice: 14900,
  });
  findUniqueInventoryConfig.mockResolvedValue({ id: 1, totalBins: 100, totalDollies: 5 });
  findManyBooking.mockResolvedValue([]);
  createBooking.mockResolvedValue({
    id: "booking_1",
    bookingRef: "MVU-TEST01",
    customerEmail: "jane@example.com",
    customerName: "Jane Doe",
    package: { id: "pkg_1", name: "Studio/1BR", basePrice: 14900 },
  });
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
    expect(body.error).toContain("hello@moveitunits.example");
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
    findUniqueInventoryConfig.mockResolvedValue({ id: 1, totalBins: 0, totalDollies: 0 });

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
