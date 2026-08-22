// Site-wide contact info. Placeholder values — swap in the real business
// phone number and email here, in this one file.
export const PHONE_DISPLAY = "(561) 888-0801";
export const PHONE_TEL_HREF = "tel:+15618880801";
export const CONTACT_EMAIL = "contact@moveitunits.com";

// Cents, per day past the included week — see lib/pricing.ts.
export const EXTENSION_DAILY_RATE_CENTS = 1000;

// "Move It Units" is a DBA — swap this in once the fictitious-name filing
// gives you the registered entity (e.g. "Acme Holdings LLC"). Shows up in
// the footer's fictitious-name disclosure.
export const REGISTERED_ENTITY_NAME = "[registered entity name — pending DBA filing]";

// Single source of truth for bin dimensions — the FAQ and the package card
// spec line both read from this so they can't drift apart.
export const BIN_DIMENSIONS = {
  lengthInches: 27,
  widthInches: 17,
  heightInches: 12,
  volumeCubicFeet: 2.5,
} as const;
