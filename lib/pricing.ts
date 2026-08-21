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
 * Rental days are inclusive of both endpoints — delivery Monday, pickup the
 * following Monday is 8 days, not 7. The package covers the first
 * INCLUDED_RENTAL_DAYS of those; anything past that is billed at
 * EXTENSION_DAILY_RATE_CENTS per day. This is the sole source of truth for
 * extension pricing — the booking API computes the authoritative charge from
 * it, and the booking form mirrors it client-side only as a preview.
 */
export function computeExtensionPricing(deliveryDate: Date, pickupDate: Date): ExtensionPricing {
  const start = toUTCDateOnly(deliveryDate);
  const end = toUTCDateOnly(pickupDate);
  const totalDays = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;

  const extensionDays = Math.max(0, totalDays - INCLUDED_RENTAL_DAYS);
  const extensionCost = extensionDays * EXTENSION_DAILY_RATE_CENTS;

  return { includedDays: INCLUDED_RENTAL_DAYS, extensionDays, extensionCost };
}
