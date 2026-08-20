const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number): string {
  return currencyFormatter.format(cents / 100);
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  weekday: "short",
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Formats a date stored as a UTC-midnight calendar day without a local-timezone shift. */
export function formatCalendarDate(date: Date | string): string {
  return dateFormatter.format(new Date(date));
}
