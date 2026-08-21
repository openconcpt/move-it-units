// Non-binding routing hint on a booking — see prisma/schema.prisma and
// lib/availability.ts, which must never read this. One preference applies
// to both the delivery and pickup trip.
export const TIME_PREFERENCE_VALUES = ["MORNING", "AFTERNOON", "NO_PREFERENCE"] as const;
export type TimePreference = (typeof TIME_PREFERENCE_VALUES)[number];

export const DEFAULT_TIME_PREFERENCE: TimePreference = "NO_PREFERENCE";

export const TIME_PREFERENCE_OPTIONS: { value: TimePreference; label: string }[] = [
  { value: "MORNING", label: "Morning" },
  { value: "AFTERNOON", label: "Afternoon" },
  { value: "NO_PREFERENCE", label: "No preference" },
];

export const TIME_PREFERENCE_EXPECTATION_COPY =
  "We'll text you the afternoon before each trip with a two-hour window. Your preference helps us plan the route, but we can't guarantee a specific time.";
