// Excludes visually ambiguous characters (0/O, 1/I).
const REF_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Generates a short human-readable booking code, e.g. "MVU-7K2P9Q". */
export function generateBookingRef(): string {
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += REF_ALPHABET[Math.floor(Math.random() * REF_ALPHABET.length)];
  }
  return `MVU-${suffix}`;
}
