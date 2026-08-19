import type { Prisma, PrismaClient } from "@prisma/client";

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "delivered"
  | "returned"
  | "cancelled";

export const DEFAULT_TURNAROUND_BUFFER_DAYS = 1;

export interface ExistingBookingInput {
  id?: string;
  deliveryDate: Date;
  pickupDate: Date;
  status: BookingStatus;
  binCount: number;
  dollyCount: number;
}

export interface AvailabilityRequest {
  deliveryDate: Date;
  pickupDate: Date;
  binCount: number;
  dollyCount: number;
}

export interface InventoryTotals {
  totalBins: number;
  totalDollies: number;
}

export interface AvailabilityResult {
  available: boolean;
  binsShortfallDays: Date[];
  dolliesShortfallDays: Date[];
  reason: string | null;
}

interface DateRange {
  start: Date;
  end: Date;
}

/** Truncates a Date to a UTC calendar day, discarding any time-of-day component. */
function toUTCDateOnly(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.start.getTime() <= b.end.getTime() && b.start.getTime() <= a.end.getTime();
}

/**
 * The full span of days a booking holds inventory for: delivery through
 * pickup inclusive, plus a turnaround buffer of unavailable days afterward
 * for cleaning/inspection.
 */
export function getOccupiedDateRange(
  deliveryDate: Date,
  pickupDate: Date,
  bufferDays: number = DEFAULT_TURNAROUND_BUFFER_DAYS
): DateRange {
  const start = toUTCDateOnly(deliveryDate);
  const pickup = toUTCDateOnly(pickupDate);
  if (pickup.getTime() < start.getTime()) {
    throw new RangeError("pickupDate cannot be before deliveryDate");
  }
  const end = addDays(pickup, bufferDays);
  return { start, end };
}

function enumerateDays(range: DateRange): Date[] {
  const days: Date[] = [];
  let cur = range.start;
  while (cur.getTime() <= range.end.getTime()) {
    days.push(cur);
    cur = addDays(cur, 1);
  }
  return days;
}

/**
 * Pure availability check: given a requested date range/package and the set
 * of existing (non-cancelled) bookings, determines whether enough bins AND
 * dollies are free on every day the request would occupy. Has no I/O so it
 * can be unit tested directly.
 */
export function checkAvailability(
  request: AvailabilityRequest,
  existingBookings: ExistingBookingInput[],
  inventory: InventoryTotals,
  bufferDays: number = DEFAULT_TURNAROUND_BUFFER_DAYS
): AvailabilityResult {
  const candidate = getOccupiedDateRange(
    request.deliveryDate,
    request.pickupDate,
    bufferDays
  );

  const activeRanges = existingBookings
    .filter((b) => b.status !== "cancelled")
    .map((b) => ({
      binCount: b.binCount,
      dollyCount: b.dollyCount,
      range: getOccupiedDateRange(b.deliveryDate, b.pickupDate, bufferDays),
    }))
    .filter((b) => rangesOverlap(candidate, b.range));

  const binsShortfallDays: Date[] = [];
  const dolliesShortfallDays: Date[] = [];

  for (const day of enumerateDays(candidate)) {
    let usedBins = 0;
    let usedDollies = 0;

    for (const booking of activeRanges) {
      if (
        day.getTime() >= booking.range.start.getTime() &&
        day.getTime() <= booking.range.end.getTime()
      ) {
        usedBins += booking.binCount;
        usedDollies += booking.dollyCount;
      }
    }

    if (usedBins + request.binCount > inventory.totalBins) {
      binsShortfallDays.push(day);
    }
    if (usedDollies + request.dollyCount > inventory.totalDollies) {
      dolliesShortfallDays.push(day);
    }
  }

  const available = binsShortfallDays.length === 0 && dolliesShortfallDays.length === 0;

  let reason: string | null = null;
  if (!available) {
    const parts: string[] = [];
    if (binsShortfallDays.length > 0) parts.push("bins");
    if (dolliesShortfallDays.length > 0) parts.push("dollies");
    reason = `Not enough ${parts.join(" and ")} available for the requested date range`;
  }

  return { available, binsShortfallDays, dolliesShortfallDays, reason };
}

type PrismaClientOrTransaction = PrismaClient | Prisma.TransactionClient;

export interface CheckPackageAvailabilityParams {
  packageId: string;
  deliveryDate: Date;
  pickupDate: Date;
  /** Exclude this booking id from the overlap check (e.g. when re-validating an existing booking). */
  excludeBookingId?: string;
  bufferDays?: number;
}

/**
 * DB-aware wrapper around checkAvailability: loads the package, the single
 * inventory config row, and every non-cancelled booking that could overlap
 * the requested range, then delegates to the pure function above.
 */
export async function checkPackageAvailability(
  client: PrismaClientOrTransaction,
  {
    packageId,
    deliveryDate,
    pickupDate,
    excludeBookingId,
    bufferDays = DEFAULT_TURNAROUND_BUFFER_DAYS,
  }: CheckPackageAvailabilityParams
): Promise<AvailabilityResult> {
  const pkg = await client.package.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.active) {
    return {
      available: false,
      binsShortfallDays: [],
      dolliesShortfallDays: [],
      reason: "Package not found or inactive",
    };
  }

  const inventoryConfig = await client.inventoryConfig.findUnique({
    where: { id: 1 },
  });
  if (!inventoryConfig) {
    throw new Error("Inventory config has not been set up");
  }

  const candidate = getOccupiedDateRange(deliveryDate, pickupDate, bufferDays);
  // A booking's occupied range can start up to `bufferDays` before its own
  // pickupDate, so widen the delivery-side query bound by that much to catch
  // every booking whose (delivery..pickup+buffer) range could overlap ours.
  const queryStart = addDays(candidate.start, -bufferDays);

  const overlappingBookings = await client.booking.findMany({
    where: {
      status: { not: "cancelled" },
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      deliveryDate: { lte: candidate.end },
      pickupDate: { gte: queryStart },
    },
    include: { package: { select: { binCount: true, dollyCount: true } } },
  });

  const existingBookings: ExistingBookingInput[] = overlappingBookings.map((b) => ({
    id: b.id,
    deliveryDate: b.deliveryDate,
    pickupDate: b.pickupDate,
    status: b.status as BookingStatus,
    binCount: b.package.binCount,
    dollyCount: b.package.dollyCount,
  }));

  return checkAvailability(
    {
      deliveryDate,
      pickupDate,
      binCount: pkg.binCount,
      dollyCount: pkg.dollyCount,
    },
    existingBookings,
    { totalBins: inventoryConfig.totalBins, totalDollies: inventoryConfig.totalDollies },
    bufferDays
  );
}
