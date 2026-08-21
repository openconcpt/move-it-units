/** Truncates a Date to a UTC calendar day, discarding any time-of-day component. */
export function toUTCDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}
