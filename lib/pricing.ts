import { toUTCDateOnly } from "./dates";
import { EXTENSION_DAILY_RATE_CENTS } from "./siteConfig";

/** Every package includes this many rental days before extension pricing kicks in. */
export const INCLUDED_RENTAL_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface ExtensionPricing {
  includedDays: number;
  extensionDays: number;
  /** Cents. */
  extensionCost: number;
}

/**
 * Rental duration is billed like hotel nights — pickupDate minus
 * deliveryDate in whole days, NOT an inclusive day count. Delivery Aug 21,
 * pickup Aug 28 is 7 days (exactly the included week, zero extension);
 * delivery Aug 21, pickup Aug 30 is 9 days (2 extension days).
 *
 * This is deliberately different from lib/availability.ts, which reserves
 * capacity inclusive of both endpoints (the bins are physically out on both
 * the delivery date and the pickup date) plus the turnaround buffer. Do not
 * "fix" this to match that — they answer different questions: availability
 * asks which days the fleet is unavailable, this asks how many rental days
 * to bill for.
 *
 * The package covers the first INCLUDED_RENTAL_DAYS; anything past that is
 * billed at EXTENSION_DAILY_RATE_CENTS per day. This is the sole source of
 * truth for extension pricing — the booking API computes the authoritative
 * charge from it, and the booking form mirrors it client-side only as a
 * preview.
 */
export function computeExtensionPricing(deliveryDate: Date, pickupDate: Date): ExtensionPricing {
  const start = toUTCDateOnly(deliveryDate);
  const end = toUTCDateOnly(pickupDate);
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);

  const extensionDays = Math.max(0, totalDays - INCLUDED_RENTAL_DAYS);
  const extensionCost = extensionDays * EXTENSION_DAILY_RATE_CENTS;

  return { includedDays: INCLUDED_RENTAL_DAYS, extensionDays, extensionCost };
}
