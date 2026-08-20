// Configurable delivery-area allowlist. Replace with the real service
// footprint before launch — this is an illustrative example (Columbus, OH
// area ZIPs).
export const SERVICE_AREA_ZIPS: readonly string[] = [
  "43201",
  "43202",
  "43203",
  "43204",
  "43205",
  "43206",
  "43207",
  "43209",
  "43210",
  "43211",
  "43212",
  "43213",
  "43214",
  "43215",
  "43219",
  "43220",
  "43221",
  "43222",
  "43223",
  "43224",
  "43228",
  "43229",
  "43230",
  "43235",
];

export const SERVICE_AREA_CONTACT_EMAIL = "hello@moveitunits.example";

/**
 * Normalizes a US ZIP or ZIP+4 string to its 5-digit form. Returns null if
 * the input isn't a well-formed ZIP.
 */
export function normalizeZip(raw: string): string | null {
  const match = raw.trim().match(/^(\d{5})(-\d{4})?$/);
  return match ? match[1] : null;
}

export function isZipInServiceArea(zip: string): boolean {
  const normalized = normalizeZip(zip);
  if (!normalized) return false;
  return SERVICE_AREA_ZIPS.includes(normalized);
}
