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

  it("7 days apart (pickup minus delivery, not inclusive) is exactly the included week — no extension", () => {
    // Delivery Aug 21, pickup Aug 28 — hotel-nights style: 7 days apart.
    const result = computeExtensionPricing(d("2026-08-21"), d("2026-08-28"));
    expect(result.extensionDays).toBe(0);
    expect(result.extensionCost).toBe(0);
  });

  it("8 days apart is exactly one extension day", () => {
    const result = computeExtensionPricing(d("2026-08-21"), d("2026-08-29"));
    expect(result.extensionDays).toBe(1);
    expect(result.extensionCost).toBe(EXTENSION_DAILY_RATE_CENTS);
  });

  it("6 days apart is no extension and does not go negative", () => {
    const result = computeExtensionPricing(d("2026-08-21"), d("2026-08-27"));
    expect(result.extensionDays).toBe(0);
    expect(result.extensionCost).toBe(0);
  });

  it("same-day delivery and pickup (0 days apart) is no extension", () => {
    const result = computeExtensionPricing(d("2026-03-10"), d("2026-03-10"));
    expect(result.extensionDays).toBe(0);
    expect(result.extensionCost).toBe(0);
  });

  it("14 days apart charges 7 extension days", () => {
    const result = computeExtensionPricing(d("2026-06-01"), d("2026-06-15"));
    expect(result.extensionDays).toBe(7);
    expect(result.extensionCost).toBe(7 * EXTENSION_DAILY_RATE_CENTS);
  });

  it("delivery Aug 21, pickup Aug 30 (9 days apart) is 2 extension days at $20 — the example from the spec", () => {
    const result = computeExtensionPricing(d("2026-08-21"), d("2026-08-30"));
    expect(result.extensionDays).toBe(2);
    expect(result.extensionCost).toBe(2000);
  });
});
