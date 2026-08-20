// Well-known add-on slugs, shared by the seed script, availability logic,
// API routes, and the booking form so they can never drift apart.
export const ADD_ON_SLUGS = {
  extraBins: "extra-bins",
  extraDolly: "extra-dolly",
  blankets: "blankets",
} as const;

export type AddOnSlug = (typeof ADD_ON_SLUGS)[keyof typeof ADD_ON_SLUGS];
