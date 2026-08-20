import { CONTACT_EMAIL } from "./siteConfig";

// Configurable delivery-area allowlist. All Palm Beach County, FL ZIP
// codes, except the far-western county — Belle Glade (33430), Pahokee
// (33476), and South Bay (33493) — which is too far to serve.
export const SERVICE_AREA_ZIPS: readonly string[] = [
  "33401",
  "33402",
  "33403",
  "33404",
  "33405",
  "33406",
  "33407",
  "33408",
  "33409",
  "33410",
  "33411",
  "33412",
  "33413",
  "33414",
  "33415",
  "33416",
  "33417",
  "33418",
  "33419",
  "33420",
  "33421",
  "33422",
  "33424",
  "33425",
  "33426",
  "33427",
  "33428",
  "33429",
  "33431",
  "33432",
  "33433",
  "33434",
  "33435",
  "33436",
  "33437",
  "33438",
  "33444",
  "33445",
  "33446",
  "33448",
  "33449",
  "33454",
  "33458",
  "33459",
  "33460",
  "33461",
  "33462",
  "33463",
  "33464",
  "33465",
  "33466",
  "33467",
  "33468",
  "33469",
  "33470",
  "33472",
  "33473",
  "33474",
  "33477",
  "33478",
  "33480",
  "33481",
  "33482",
  "33483",
  "33484",
  "33486",
  "33487",
  "33488",
  "33496",
  "33497",
  "33498",
  "33499",
];

export const SERVICE_AREA_CONTACT_EMAIL = CONTACT_EMAIL;

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
