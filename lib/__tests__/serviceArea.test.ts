import { describe, expect, it } from "vitest";
import { isZipInServiceArea, normalizeZip, SERVICE_AREA_ZIPS } from "../serviceArea";

describe("normalizeZip", () => {
  it("accepts a plain 5-digit ZIP", () => {
    expect(normalizeZip("43215")).toBe("43215");
  });

  it("accepts a ZIP+4 and returns just the 5-digit prefix", () => {
    expect(normalizeZip("43215-1234")).toBe("43215");
  });

  it("trims surrounding whitespace", () => {
    expect(normalizeZip("  43215  ")).toBe("43215");
  });

  it("rejects too few digits", () => {
    expect(normalizeZip("4321")).toBeNull();
  });

  it("rejects too many digits", () => {
    expect(normalizeZip("432156")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(normalizeZip("abcde")).toBeNull();
  });

  it("rejects an empty string", () => {
    expect(normalizeZip("")).toBeNull();
  });

  it("rejects a malformed ZIP+4 suffix", () => {
    expect(normalizeZip("43215-12")).toBeNull();
  });
});

describe("isZipInServiceArea", () => {
  it("returns true for a ZIP in the allowlist", () => {
    expect(SERVICE_AREA_ZIPS.length).toBeGreaterThan(0);
    expect(isZipInServiceArea(SERVICE_AREA_ZIPS[0])).toBe(true);
  });

  it("returns true for an in-area ZIP+4", () => {
    expect(isZipInServiceArea(`${SERVICE_AREA_ZIPS[0]}-9999`)).toBe(true);
  });

  it("returns false for a well-formed ZIP outside the allowlist", () => {
    expect(isZipInServiceArea("99999")).toBe(false);
  });

  it("returns false for malformed input rather than throwing", () => {
    expect(isZipInServiceArea("not-a-zip")).toBe(false);
  });
});
