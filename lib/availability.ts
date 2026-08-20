import type { PrismaClientOrTransaction } from "./prisma";
import { ADD_ON_SLUGS } from "./addOns";

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
  /** Total bin demand: package.binCount + add-ons, already resolved by the caller. */
  binCount: number;
  /** Total dolly demand: package.dollyCount + add-ons, already resolved by the caller. */
  dollyCount: number;
  /** Total blanket demand from add-ons, already resolved by the caller. */
  blanketCount?: number;
  /** Only meaningful while status is "pending"; past this instant the booking no longer holds inventory. */
  expiresAt?: Date | null;
}

export interface AvailabilityRequest {
  deliveryDate: Date;
  pickupDate: Date;
  binCount: number;
  dollyCount: number;
  blanketCount?: number;
}

export interface InventoryTotals {
  totalBins: number;
  totalDollies: number;
  totalBlankets?: number;
}

export interface AvailabilityResult {
  available: boolean;
  binsShortfallDays: Date[];
  dolliesShortfallDays: Date[];
  blanketsShortfallDays: Date[];
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

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return items.join(" and ");
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

/**
 * Cancelled bookings never hold inventory. Pending bookings stop holding
 * inventory once their expiresAt has passed (an abandoned checkout should
 * not lock capacity forever).
 */
function isHoldingInventory(booking: ExistingBookingInput, now: Date): boolean {
  if (booking.status === "cancelled") return false;
  if (booking.status === "pending" && booking.expiresAt && booking.expiresAt.getTime() <= now.getTime()) {
    return false;
  }
  return true;
}

/**
 * The full span of days a booking holds inventory for: delivery through
 * pickup inclusive, plus a turnaround buffer of unavailable days afterward
 * for cleaning/inspection. Add-ons occupy the same range as the package.
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
 * Pure availability check: given a requested date range and the set of
 * existing (non-cancelled) bookings, determines whether enough bins,
 * dollies, AND blankets are free on every day the request would occupy.
 * binCount/dollyCount/blanketCount are already-resolved totals (package
 * base quantity plus any add-ons) — this function has no notion of
 * packages or add-ons, only capacity. Has no I/O so it can be unit tested
 * directly.
 */
export function checkAvailability(
  request: AvailabilityRequest,
  existingBookings: ExistingBookingInput[],
  inventory: InventoryTotals,
  bufferDays: number = DEFAULT_TURNAROUND_BUFFER_DAYS,
  now: Date = new Date()
): AvailabilityResult {
  const candidate = getOccupiedDateRange(
    request.deliveryDate,
    request.pickupDate,
    bufferDays
  );

  const activeRanges = existingBookings
    .filter((b) => isHoldingInventory(b, now))
    .map((b) => ({
      binCount: b.binCount,
      dollyCount: b.dollyCount,
      blanketCount: b.blanketCount ?? 0,
      range: getOccupiedDateRange(b.deliveryDate, b.pickupDate, bufferDays),
    }))
    .filter((b) => rangesOverlap(candidate, b.range));

  const requestBlanketCount = request.blanketCount ?? 0;

  const binsShortfallDays: Date[] = [];
  const dolliesShortfallDays: Date[] = [];
  const blanketsShortfallDays: Date[] = [];

  for (const day of enumerateDays(candidate)) {
    let usedBins = 0;
    let usedDollies = 0;
    let usedBlankets = 0;

    for (const booking of activeRanges) {
      if (
        day.getTime() >= booking.range.start.getTime() &&
        day.getTime() <= booking.range.end.getTime()
      ) {
        usedBins += booking.binCount;
        usedDollies += booking.dollyCount;
        usedBlankets += booking.blanketCount;
      }
    }

    if (usedBins + request.binCount > inventory.totalBins) {
      binsShortfallDays.push(day);
    }
    if (usedDollies + request.dollyCount > inventory.totalDollies) {
      dolliesShortfallDays.push(day);
    }
    if (usedBlankets + requestBlanketCount > (inventory.totalBlankets ?? 0)) {
      blanketsShortfallDays.push(day);
    }
  }

  const available =
    binsShortfallDays.length === 0 &&
    dolliesShortfallDays.length === 0 &&
    blanketsShortfallDays.length === 0;

  let reason: string | null = null;
  if (!available) {
    const parts: string[] = [];
    if (binsShortfallDays.length > 0) parts.push("bins");
    if (dolliesShortfallDays.length > 0) parts.push("dollies");
    if (blanketsShortfallDays.length > 0) parts.push("blankets");
    reason = `Not enough ${joinWithAnd(parts)} available for the requested date range`;
  }

  return { available, binsShortfallDays, dolliesShortfallDays, blanketsShortfallDays, reason };
}

interface AddOnMultipliers {
  binsPerExtraBinPack: number;
  dolliesPerExtraDolly: number;
  blanketsPerBlanketPack: number;
}

/**
 * Looks up the physical bins/dollies/blankets each add-on unit represents,
 * straight from the same AddOn rows that price it — never a hardcoded
 * constant — so availability math can't silently drift from what's sold.
 * Deliberately ignores `active`: a booking made while an add-on was active
 * must keep holding the capacity it consumed even after the add-on is
 * later deactivated.
 */
async function resolveAddOnMultipliers(
  client: PrismaClientOrTransaction
): Promise<AddOnMultipliers> {
  const slugs = [ADD_ON_SLUGS.extraBins, ADD_ON_SLUGS.extraDolly, ADD_ON_SLUGS.blankets];
  const addOns = await client.addOn.findMany({ where: { slug: { in: slugs } } });
  const bySlug = new Map(addOns.map((a) => [a.slug, a]));

  const extraBins = bySlug.get(ADD_ON_SLUGS.extraBins);
  const extraDolly = bySlug.get(ADD_ON_SLUGS.extraDolly);
  const blankets = bySlug.get(ADD_ON_SLUGS.blankets);

  if (!extraBins || !extraDolly || !blankets) {
    throw new Error(
      "Add-on catalog is missing required rows (extra-bins, extra-dolly, blankets) — run the seed script"
    );
  }

  return {
    binsPerExtraBinPack: extraBins.binsPerUnit,
    dolliesPerExtraDolly: extraDolly.dolliesPerUnit,
    blanketsPerBlanketPack: blankets.blanketsPerUnit,
  };
}

export interface CheckPackageAvailabilityParams {
  packageId: string;
  deliveryDate: Date;
  pickupDate: Date;
  extraBinPacks?: number;
  extraDollies?: number;
  blanketPacks?: number;
  /** Exclude this booking id from the overlap check (e.g. when re-validating an existing booking). */
  excludeBookingId?: string;
  bufferDays?: number;
  now?: Date;
}

/**
 * DB-aware wrapper around checkAvailability: loads the package, the add-on
 * catalog, the single inventory config row, and every non-cancelled booking
 * that could overlap the requested range (resolving each one's own add-on
 * demand too), then delegates to the pure function above.
 */
export async function checkPackageAvailability(
  client: PrismaClientOrTransaction,
  {
    packageId,
    deliveryDate,
    pickupDate,
    extraBinPacks = 0,
    extraDollies = 0,
    blanketPacks = 0,
    excludeBookingId,
    bufferDays = DEFAULT_TURNAROUND_BUFFER_DAYS,
    now = new Date(),
  }: CheckPackageAvailabilityParams
): Promise<AvailabilityResult> {
  const pkg = await client.package.findUnique({ where: { id: packageId } });
  if (!pkg || !pkg.active) {
    return {
      available: false,
      binsShortfallDays: [],
      dolliesShortfallDays: [],
      blanketsShortfallDays: [],
      reason: "Package not found or inactive",
    };
  }

  const inventoryConfig = await client.inventoryConfig.findUnique({
    where: { id: 1 },
  });
  if (!inventoryConfig) {
    throw new Error("Inventory config has not been set up");
  }

  const multipliers = await resolveAddOnMultipliers(client);

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
    binCount: b.package.binCount + b.extraBinPacks * multipliers.binsPerExtraBinPack,
    dollyCount: b.package.dollyCount + b.extraDollies * multipliers.dolliesPerExtraDolly,
    blanketCount: b.blanketPacks * multipliers.blanketsPerBlanketPack,
    expiresAt: b.expiresAt,
  }));

  return checkAvailability(
    {
      deliveryDate,
      pickupDate,
      binCount: pkg.binCount + extraBinPacks * multipliers.binsPerExtraBinPack,
      dollyCount: pkg.dollyCount + extraDollies * multipliers.dolliesPerExtraDolly,
      blanketCount: blanketPacks * multipliers.blanketsPerBlanketPack,
    },
    existingBookings,
    {
      totalBins: inventoryConfig.totalBins,
      totalDollies: inventoryConfig.totalDollies,
      totalBlankets: inventoryConfig.totalBlankets,
    },
    bufferDays,
    now
  );
}
