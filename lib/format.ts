const wholeDollarFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const centsFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** $149.00 -> "$149"; $149.50 -> "$149.50" — never a single trailing digit. */
export function formatCents(cents: number): string {
  const formatter = cents % 100 === 0 ? wholeDollarFormatter : centsFormatter;
  return formatter.format(cents / 100);
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
