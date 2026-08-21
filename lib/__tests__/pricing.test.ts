import { describe, expect, it } from "vitest";
import { computeExtensionPricing, INCLUDED_RENTAL_DAYS } from "../pricing";
import { EXTENSION_DAILY_RATE_CENTS } from "../siteConfig";

/** UTC-midnight date helper, e.g. d("2026-01-10"). */
function d(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

describe("computeExtensionPricing", () => {
  it("included days is always 7", () => {
    expect(INCLUDED_RENTAL_DAYS).toBe(7);
    expect(computeExtensionPricing(d("2026-01-01"), d("2026-01-01")).includedDays).toBe(7);
  });

  it("exactly 7 rental days (inclusive) is no extension", () => {
    // Monday through the following Sunday: 7 days inclusive.
    const result = computeExtensionPricing(d("2026-01-05"), d("2026-01-11"));
    expect(result.extensionDays).toBe(0);
    expect(result.extensionCost).toBe(0);
  });

  it("8 rental days is exactly one extension day — delivery Monday, pickup the following Monday", () => {
    const result = computeExtensionPricing(d("2026-01-05"), d("2026-01-12"));
    expect(result.extensionDays).toBe(1);
    expect(result.extensionCost).toBe(EXTENSION_DAILY_RATE_CENTS);
  });

  it("same-day delivery and pickup is 1 rental day and does not go negative", () => {
    const result = computeExtensionPricing(d("2026-03-10"), d("2026-03-10"));
    expect(result.extensionDays).toBe(0);
    expect(result.extensionCost).toBe(0);
  });

  it("a two-week stay charges 7 extension days", () => {
    // 2026-06-01 through 2026-06-14 inclusive = 14 rental days.
    const result = computeExtensionPricing(d("2026-06-01"), d("2026-06-14"));
    expect(result.extensionDays).toBe(7);
    expect(result.extensionCost).toBe(7 * EXTENSION_DAILY_RATE_CENTS);
  });

  it("one day short of an extra week (6 extra days) prices correctly, not off by one", () => {
    // 2026-06-01 through 2026-06-07 inclusive = 7 days -> extensionDays 0.
    // 2026-06-01 through 2026-06-13 inclusive = 13 days -> extensionDays 6.
    const result = computeExtensionPricing(d("2026-06-01"), d("2026-06-13"));
    expect(result.extensionDays).toBe(6);
    expect(result.extensionCost).toBe(6 * EXTENSION_DAILY_RATE_CENTS);
  });
});
