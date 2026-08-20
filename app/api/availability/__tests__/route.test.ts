import { beforeEach, describe, expect, it, vi } from "vitest";

const findUniquePackage = vi.fn();
const findUniqueInventoryConfig = vi.fn();
const findManyBooking = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: {
    package: { findUnique: (...args: unknown[]) => findUniquePackage(...args) },
    inventoryConfig: { findUnique: (...args: unknown[]) => findUniqueInventoryConfig(...args) },
    booking: { findMany: (...args: unknown[]) => findManyBooking(...args) },
  },
}));

const { GET } = await import("../route");

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost/api/availability");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url);
}

beforeEach(() => {
  findUniquePackage.mockReset();
  findUniqueInventoryConfig.mockReset();
  findManyBooking.mockReset();
});

describe("GET /api/availability", () => {
  it("returns 400 when required query params are missing", async () => {
    const res = await GET(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 when pickupDate precedes deliveryDate", async () => {
    const res = await GET(
      makeRequest({ packageId: "pkg_1", deliveryDate: "2026-09-05", pickupDate: "2026-09-01" })
    );
    expect(res.status).toBe(400);
  });

  it("returns available:true when the package has capacity", async () => {
    findUniquePackage.mockResolvedValue({
      id: "pkg_1",
      active: true,
      binCount: 20,
      dollyCount: 1,
    });
    findUniqueInventoryConfig.mockResolvedValue({ id: 1, totalBins: 100, totalDollies: 5 });
    findManyBooking.mockResolvedValue([]);

    const res = await GET(
      makeRequest({ packageId: "pkg_1", deliveryDate: "2026-09-01", pickupDate: "2026-09-05" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ available: true, reason: null });
  });

  it("returns available:false when existing bookings exhaust capacity", async () => {
    findUniquePackage.mockResolvedValue({
      id: "pkg_1",
      active: true,
      binCount: 20,
      dollyCount: 1,
    });
    findUniqueInventoryConfig.mockResolvedValue({ id: 1, totalBins: 20, totalDollies: 5 });
    findManyBooking.mockResolvedValue([
      {
        id: "existing_1",
        deliveryDate: new Date("2026-09-01T00:00:00.000Z"),
        pickupDate: new Date("2026-09-05T00:00:00.000Z"),
        status: "confirmed",
        expiresAt: null,
        package: { binCount: 20, dollyCount: 1 },
      },
    ]);

    const res = await GET(
      makeRequest({ packageId: "pkg_1", deliveryDate: "2026-09-01", pickupDate: "2026-09-05" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.reason).toBeTruthy();
  });

  it("returns available:false when the package doesn't exist, without erroring", async () => {
    findUniquePackage.mockResolvedValue(null);

    const res = await GET(
      makeRequest({ packageId: "missing", deliveryDate: "2026-09-01", pickupDate: "2026-09-05" })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.available).toBe(false);
    expect(body.reason).toBeTruthy();
    expect(findUniqueInventoryConfig).not.toHaveBeenCalled();
  });
});
