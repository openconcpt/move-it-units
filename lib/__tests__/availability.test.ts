import { describe, expect, it } from "vitest";
import {
  checkAvailability,
  getOccupiedDateRange,
  DEFAULT_TURNAROUND_BUFFER_DAYS,
  type ExistingBookingInput,
} from "../availability";

/** UTC-midnight date helper, e.g. d("2026-01-10"). */
function d(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Precise-instant helper for expiresAt/now comparisons, e.g. dt("2026-01-10T09:30:00Z"). */
function dt(isoStr: string): Date {
  return new Date(isoStr);
}

function booking(
  overrides: Omit<Partial<ExistingBookingInput>, "deliveryDate" | "pickupDate"> & {
    deliveryDate: string;
    pickupDate: string;
  }
): ExistingBookingInput {
  const { deliveryDate, pickupDate, ...rest } = overrides;
  return {
    status: "confirmed",
    binCount: 20,
    dollyCount: 1,
    ...rest,
    deliveryDate: d(deliveryDate),
    pickupDate: d(pickupDate),
  };
}

describe("getOccupiedDateRange", () => {
  it("spans delivery through pickup inclusive, plus the buffer", () => {
    const range = getOccupiedDateRange(d("2026-01-01"), d("2026-01-05"), 1);
    expect(range.start).toEqual(d("2026-01-01"));
    expect(range.end).toEqual(d("2026-01-06"));
  });

  it("supports a zero-day buffer", () => {
    const range = getOccupiedDateRange(d("2026-01-01"), d("2026-01-05"), 0);
    expect(range.end).toEqual(d("2026-01-05"));
  });

  it("throws if pickupDate precedes deliveryDate", () => {
    expect(() => getOccupiedDateRange(d("2026-01-05"), d("2026-01-01"))).toThrow(
      RangeError
    );
  });
});

describe("checkAvailability", () => {
  const inventory = { totalBins: 20, totalDollies: 2 };

  it("is available when there are no existing bookings", () => {
    const result = checkAvailability(
      { deliveryDate: d("2026-01-01"), pickupDate: d("2026-01-05"), binCount: 20, dollyCount: 1 },
      [],
      inventory
    );
    expect(result.available).toBe(true);
    expect(result.reason).toBeNull();
  });

  describe("exact-boundary overlaps", () => {
    it("rejects a request that starts on the existing booking's last occupied (buffer) day", () => {
      // Existing booking uses all 20 bins: delivery Jan1 -> pickup Jan5,
      // occupied through Jan6 inclusive (1-day buffer).
      const existing = [booking({ deliveryDate: "2026-01-01", pickupDate: "2026-01-05", binCount: 20 })];

      const result = checkAvailability(
        { deliveryDate: d("2026-01-06"), pickupDate: d("2026-01-10"), binCount: 5, dollyCount: 1 },
        existing,
        inventory
      );

      expect(result.available).toBe(false);
      expect(result.binsShortfallDays).toContainEqual(d("2026-01-06"));
    });

    it("accepts a request that starts the day after the buffer ends", () => {
      const existing = [booking({ deliveryDate: "2026-01-01", pickupDate: "2026-01-05", binCount: 20 })];

      const result = checkAvailability(
        { deliveryDate: d("2026-01-07"), pickupDate: d("2026-01-10"), binCount: 20, dollyCount: 1 },
        existing,
        inventory
      );

      expect(result.available).toBe(true);
    });

    it("accepts a new booking that starts exactly when a prior one's full range (incl. buffer) ends, using its own buffer correctly", () => {
      // Existing occupies Jan1..Jan6 (incl buffer). A same-day request for
      // Jan6 delivery conflicts (tested above); confirm Jan6 pickup edge on
      // the *new* booking's own range is computed inclusively too.
      const existing = [booking({ deliveryDate: "2026-01-10", pickupDate: "2026-01-15", binCount: 20 })];

      const result = checkAvailability(
        { deliveryDate: d("2026-01-05"), pickupDate: d("2026-01-09"), binCount: 20, dollyCount: 1 },
        existing,
        inventory
      );

      // New booking occupied range: Jan5..Jan10 (pickup Jan9 + 1 buffer day).
      // Existing starts Jan10 -> they touch at Jan10, which IS a conflict.
      expect(result.available).toBe(false);
      expect(result.binsShortfallDays).toContainEqual(d("2026-01-10"));
    });
  });

  describe("buffer-day collisions", () => {
    it("blocks a request whose range only intersects an existing booking's buffer day, not its stay", () => {
      // Existing stay is Jan1-Jan5, buffer occupies Jan6 only.
      const existing = [booking({ deliveryDate: "2026-01-01", pickupDate: "2026-01-05", dollyCount: 2 })];

      const result = checkAvailability(
        { deliveryDate: d("2026-01-06"), pickupDate: d("2026-01-06"), binCount: 1, dollyCount: 1 },
        existing,
        inventory
      );

      expect(result.available).toBe(false);
      expect(result.dolliesShortfallDays).toEqual([d("2026-01-06")]);
    });
  });

  describe("partial availability (bins free, dollies not)", () => {
    it("reports unavailable with only dollies shortfall when bins have room", () => {
      const roomyBins = { totalBins: 100, totalDollies: 2 };
      const existing = [
        booking({ deliveryDate: "2026-02-01", pickupDate: "2026-02-10", binCount: 10, dollyCount: 2 }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-02-03"), pickupDate: d("2026-02-05"), binCount: 10, dollyCount: 1 },
        existing,
        roomyBins
      );

      expect(result.available).toBe(false);
      expect(result.binsShortfallDays).toEqual([]);
      expect(result.dolliesShortfallDays.length).toBeGreaterThan(0);
      expect(result.reason).toContain("dollies");
      expect(result.reason).not.toContain("bins");
    });
  });

  describe("cancelled bookings", () => {
    it("do not hold inventory, freeing capacity for a new request", () => {
      const existing = [
        booking({
          deliveryDate: "2026-01-01",
          pickupDate: "2026-01-10",
          binCount: 20,
          dollyCount: 2,
          status: "cancelled",
        }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-01-03"), pickupDate: d("2026-01-06"), binCount: 20, dollyCount: 2 },
        existing,
        inventory
      );

      expect(result.available).toBe(true);
    });

    it("still blocks on other non-cancelled bookings while ignoring cancelled ones", () => {
      const existing = [
        booking({
          deliveryDate: "2026-01-01",
          pickupDate: "2026-01-10",
          binCount: 20,
          dollyCount: 2,
          status: "cancelled",
        }),
        booking({
          deliveryDate: "2026-01-04",
          pickupDate: "2026-01-05",
          binCount: 15,
          dollyCount: 1,
          status: "confirmed",
        }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-01-04"), pickupDate: d("2026-01-04"), binCount: 10, dollyCount: 1 },
        existing,
        inventory
      );

      // 15 (active) + 10 requested = 25 > 20 total bins.
      expect(result.available).toBe(false);
      expect(result.binsShortfallDays.length).toBeGreaterThan(0);
    });
  });

  describe("pending booking expiry", () => {
    const now = dt("2026-04-01T10:00:00.000Z");

    it("ignores a pending booking whose expiresAt has passed, freeing its capacity", () => {
      const existing = [
        booking({
          deliveryDate: "2026-04-01",
          pickupDate: "2026-04-05",
          binCount: 20,
          status: "pending",
          expiresAt: dt("2026-04-01T09:00:00.000Z"), // expired 1h before `now`
        }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-04-01"), pickupDate: d("2026-04-05"), binCount: 20, dollyCount: 1 },
        existing,
        inventory,
        DEFAULT_TURNAROUND_BUFFER_DAYS,
        now
      );

      expect(result.available).toBe(true);
    });

    it("still holds inventory for a pending booking whose expiresAt has not passed yet", () => {
      const existing = [
        booking({
          deliveryDate: "2026-04-01",
          pickupDate: "2026-04-05",
          binCount: 20,
          status: "pending",
          expiresAt: dt("2026-04-01T11:00:00.000Z"), // expires 1h after `now`
        }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-04-01"), pickupDate: d("2026-04-05"), binCount: 20, dollyCount: 1 },
        existing,
        inventory,
        DEFAULT_TURNAROUND_BUFFER_DAYS,
        now
      );

      expect(result.available).toBe(false);
      expect(result.binsShortfallDays.length).toBeGreaterThan(0);
    });

    it("treats expiresAt exactly equal to now as already expired", () => {
      const existing = [
        booking({
          deliveryDate: "2026-04-01",
          pickupDate: "2026-04-05",
          binCount: 20,
          status: "pending",
          expiresAt: now,
        }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-04-01"), pickupDate: d("2026-04-05"), binCount: 20, dollyCount: 1 },
        existing,
        inventory,
        DEFAULT_TURNAROUND_BUFFER_DAYS,
        now
      );

      expect(result.available).toBe(true);
    });

    it("ignores expiresAt for non-pending statuses, e.g. a confirmed booking always holds inventory", () => {
      const existing = [
        booking({
          deliveryDate: "2026-04-01",
          pickupDate: "2026-04-05",
          binCount: 20,
          status: "confirmed",
          // Stale/unset expiresAt from before confirmation shouldn't matter.
          expiresAt: dt("2026-04-01T00:00:00.000Z"),
        }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-04-01"), pickupDate: d("2026-04-05"), binCount: 20, dollyCount: 1 },
        existing,
        inventory,
        DEFAULT_TURNAROUND_BUFFER_DAYS,
        now
      );

      expect(result.available).toBe(false);
    });

    it("defaults `now` to the current time when not provided", () => {
      const farFuturePending = [
        booking({
          deliveryDate: "2026-04-01",
          pickupDate: "2026-04-05",
          binCount: 20,
          status: "pending",
          expiresAt: dt("2099-01-01T00:00:00.000Z"),
        }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-04-01"), pickupDate: d("2026-04-05"), binCount: 20, dollyCount: 1 },
        farFuturePending,
        inventory
      );

      expect(result.available).toBe(false);
    });
  });

  describe("multiple overlapping bookings sum together", () => {
    it("combines usage across several concurrent bookings against the same total", () => {
      const existing = [
        booking({ deliveryDate: "2026-03-01", pickupDate: "2026-03-05", binCount: 8, dollyCount: 1 }),
        booking({ deliveryDate: "2026-03-02", pickupDate: "2026-03-04", binCount: 8, dollyCount: 1 }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-03-03"), pickupDate: d("2026-03-03"), binCount: 5, dollyCount: 1 },
        existing,
        inventory
      );

      // 8 + 8 + 5 = 21 > 20 total bins on both Mar 3 (all three overlap) and
      // Mar 4 (the request's own 1-day buffer, still within both existing ranges).
      expect(result.available).toBe(false);
      expect(result.binsShortfallDays).toEqual([d("2026-03-03"), d("2026-03-04")]);
    });
  });
});
