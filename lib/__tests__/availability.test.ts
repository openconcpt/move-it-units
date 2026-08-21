import { describe, expect, it } from "vitest";
import {
  checkAvailability,
  checkPackageAvailability,
  getOccupiedDateRange,
  DEFAULT_TURNAROUND_BUFFER_DAYS,
  type ExistingBookingInput,
  type CheckPackageAvailabilityParams,
} from "../availability";
import { ADD_ON_SLUGS } from "../addOns";

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

  describe("add-ons consume fleet capacity", () => {
    it("extra bins push an otherwise-available booking over bin capacity", () => {
      // Package alone requests 15 of 20 bins — fits fine.
      const baseline = checkAvailability(
        { deliveryDate: d("2026-05-01"), pickupDate: d("2026-05-05"), binCount: 15, dollyCount: 1 },
        [],
        inventory
      );
      expect(baseline.available).toBe(true);

      // The same request plus 1 extra-bin-pack (10 more bins): 15 + 10 = 25 > 20.
      const withExtraBins = checkAvailability(
        { deliveryDate: d("2026-05-01"), pickupDate: d("2026-05-05"), binCount: 25, dollyCount: 1 },
        [],
        inventory
      );
      expect(withExtraBins.available).toBe(false);
      expect(withExtraBins.binsShortfallDays.length).toBeGreaterThan(0);
      expect(withExtraBins.reason).toContain("bins");
    });

    it("extra dollies exhaust dolly capacity while bins remain free", () => {
      // 5 of 20 bins (plenty of room), but 3 of 2 dollies: 1 package dolly +
      // 2 extra dollies.
      const result = checkAvailability(
        { deliveryDate: d("2026-05-10"), pickupDate: d("2026-05-12"), binCount: 5, dollyCount: 3 },
        [],
        inventory
      );

      expect(result.available).toBe(false);
      expect(result.binsShortfallDays).toEqual([]);
      expect(result.dolliesShortfallDays.length).toBeGreaterThan(0);
      expect(result.reason).toContain("dollies");
      expect(result.reason).not.toContain("bins");
    });

    it("blankets are constrained independently of bins and dollies", () => {
      const inventoryWithBlankets = { totalBins: 100, totalDollies: 10, totalBlankets: 6 };

      // An existing booking already holds 1 blanket pack (6 blankets) —
      // trivial bin/dolly usage so it can't affect those dimensions.
      const existing = [
        booking({
          deliveryDate: "2026-06-01",
          pickupDate: "2026-06-05",
          binCount: 1,
          dollyCount: 1,
          blanketCount: 6,
        }),
      ];

      // A new request for 2 more blanket packs (12 blankets): 6 + 12 = 18 > 6.
      const result = checkAvailability(
        { deliveryDate: d("2026-06-02"), pickupDate: d("2026-06-03"), binCount: 1, dollyCount: 1, blanketCount: 12 },
        existing,
        inventoryWithBlankets
      );

      expect(result.available).toBe(false);
      expect(result.binsShortfallDays).toEqual([]);
      expect(result.dolliesShortfallDays).toEqual([]);
      expect(result.blanketsShortfallDays.length).toBeGreaterThan(0);
      expect(result.reason).toContain("blankets");
      expect(result.reason).not.toContain("bins");
      expect(result.reason).not.toContain("dollies");
    });

    it("a request with no blanket demand is unaffected by totalBlankets being 0", () => {
      const result = checkAvailability(
        { deliveryDate: d("2026-06-10"), pickupDate: d("2026-06-12"), binCount: 5, dollyCount: 1 },
        [],
        inventory // no totalBlankets set at all — defaults to 0 capacity
      );

      expect(result.available).toBe(true);
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

  describe("reservation spans the full booking length, not a fixed window", () => {
    it("a long booking still holds capacity on a day far past what a fixed week-plus-buffer window would cover", () => {
      // Existing booking spans 2026-05-01 through 2026-05-14 (14 days) using
      // all 20 bins. A hard-coded "delivery + 7 days + 1 buffer" window would
      // only reserve through 2026-05-09 — 2026-05-12 is well past that, so
      // this only conflicts if the *actual* full span is honored.
      const existing = [
        booking({ deliveryDate: "2026-05-01", pickupDate: "2026-05-14", binCount: 20, dollyCount: 1 }),
      ];

      const result = checkAvailability(
        { deliveryDate: d("2026-05-12"), pickupDate: d("2026-05-12"), binCount: 1, dollyCount: 1 },
        existing,
        inventory
      );

      expect(result.available).toBe(false);
      expect(result.binsShortfallDays).toContainEqual(d("2026-05-12"));
    });

    it("frees capacity again the day after the long booking's own span plus buffer ends", () => {
      const existing = [
        booking({ deliveryDate: "2026-05-01", pickupDate: "2026-05-14", binCount: 20, dollyCount: 1 }),
      ];

      // Occupied through 2026-05-14 + 1 buffer day = 2026-05-15. The 16th is clear.
      const result = checkAvailability(
        { deliveryDate: d("2026-05-16"), pickupDate: d("2026-05-16"), binCount: 20, dollyCount: 1 },
        existing,
        inventory
      );

      expect(result.available).toBe(true);
    });
  });
});

describe("checkPackageAvailability", () => {
  /** Minimal fake Prisma client — only the calls checkPackageAvailability actually makes. */
  function fakeClient(opts: {
    package: Record<string, unknown> | null;
    inventoryConfig?: Record<string, unknown> | null;
    bookings?: Record<string, unknown>[];
  }) {
    return {
      package: { findUnique: async () => opts.package },
      inventoryConfig: {
        findUnique: async () => opts.inventoryConfig ?? { id: 1, totalBins: 100, totalDollies: 10, totalBlankets: 0 },
      },
      addOn: {
        findMany: async () => [
          { slug: ADD_ON_SLUGS.extraBins, binsPerUnit: 10, dolliesPerUnit: 0, blanketsPerUnit: 0 },
          { slug: ADD_ON_SLUGS.extraDolly, binsPerUnit: 0, dolliesPerUnit: 1, blanketsPerUnit: 0 },
          { slug: ADD_ON_SLUGS.blankets, binsPerUnit: 0, dolliesPerUnit: 0, blanketsPerUnit: 6 },
        ],
      },
      booking: { findMany: async () => opts.bookings ?? [] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it("ignores labelCount entirely — a huge labelCount does not consume bin or dolly capacity", async () => {
    // binCount/dollyCount exactly saturate capacity on their own; labelCount
    // is set absurdly high so any accidental inclusion in the bins/dollies
    // math would immediately tip this over into unavailable.
    const client = fakeClient({
      package: { id: "pkg_1", active: true, binCount: 5, dollyCount: 1, labelCount: 9999 },
      inventoryConfig: { id: 1, totalBins: 5, totalDollies: 1, totalBlankets: 0 },
    });

    const params: CheckPackageAvailabilityParams = {
      packageId: "pkg_1",
      deliveryDate: d("2026-07-01"),
      pickupDate: d("2026-07-02"),
    };

    const result = await checkPackageAvailability(client, params);

    expect(result.available).toBe(true);
    expect(result.binsShortfallDays).toEqual([]);
    expect(result.dolliesShortfallDays).toEqual([]);
  });

  it("produces identical results regardless of an existing booking's timePreference", async () => {
    // 15 (existing) + 10 (extra-bin-pack per multipliers below) = 25 > 20
    // total bins — a genuine capacity conflict, unrelated to time of day.
    const scenario = (timePreference: string) =>
      fakeClient({
        package: { id: "pkg_1", active: true, binCount: 10, dollyCount: 1 },
        inventoryConfig: { id: 1, totalBins: 20, totalDollies: 5, totalBlankets: 0 },
        bookings: [
          {
            id: "existing_1",
            deliveryDate: d("2026-07-01"),
            pickupDate: d("2026-07-05"),
            status: "confirmed",
            timePreference,
            package: { binCount: 15, dollyCount: 1 },
            extraBinPacks: 0,
            extraDollies: 0,
            blanketPacks: 0,
            expiresAt: null,
          },
        ],
      });

    const params: CheckPackageAvailabilityParams = {
      packageId: "pkg_1",
      deliveryDate: d("2026-07-02"),
      pickupDate: d("2026-07-03"),
      extraBinPacks: 1,
    };

    const morning = await checkPackageAvailability(scenario("MORNING"), params);
    const afternoon = await checkPackageAvailability(scenario("AFTERNOON"), params);
    const noPreference = await checkPackageAvailability(scenario("NO_PREFERENCE"), params);

    expect(morning).toEqual(afternoon);
    expect(morning).toEqual(noPreference);
    // Sanity check this scenario is actually exercising a real conflict —
    // otherwise "identical results" would be true trivially.
    expect(morning.available).toBe(false);
    expect(morning.reason).toContain("bins");
  });

  it("two bookings both requesting MORNING on the same date are not in conflict — only capacity is", async () => {
    // Existing MORNING booking uses well under capacity; a second MORNING
    // request on the same dates must be allowed purely because it fits.
    const client = fakeClient({
      package: { id: "pkg_1", active: true, binCount: 5, dollyCount: 1 },
      inventoryConfig: { id: 1, totalBins: 100, totalDollies: 10, totalBlankets: 0 },
      bookings: [
        {
          id: "existing_1",
          deliveryDate: d("2026-07-10"),
          pickupDate: d("2026-07-12"),
          status: "confirmed",
          timePreference: "MORNING",
          package: { binCount: 5, dollyCount: 1 },
          extraBinPacks: 0,
          extraDollies: 0,
          blanketPacks: 0,
          expiresAt: null,
        },
      ],
    });

    const result = await checkPackageAvailability(client, {
      packageId: "pkg_1",
      deliveryDate: d("2026-07-10"),
      pickupDate: d("2026-07-12"),
    });

    expect(result.available).toBe(true);
  });
});
