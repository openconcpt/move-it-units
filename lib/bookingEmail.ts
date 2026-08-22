import { Resend, type CreateEmailResponse } from "resend";
import type { Prisma, PrismaClient } from "@prisma/client";
import { getEmailConfig } from "./emailConfig";
import { formatCalendarDate, formatCents } from "./format";
import { ADD_ON_SLUGS, type AddOnSlug } from "./addOns";
import { TIME_PREFERENCE_EXPECTATION_COPY } from "./timePreference";
import { computeExtensionPricing } from "./pricing";
import { PHONE_DISPLAY, EXTENSION_DAILY_RATE_CENTS } from "./siteConfig";

export type BookingForEmail = Prisma.BookingGetPayload<{ include: { package: true } }>;

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";

const EXTENSION_RATE_LINE = `Extension rate: ${formatCents(EXTENSION_DAILY_RATE_CENTS)} per day past the included week, charged to the card on file.`;
const REPLACEMENT_FEE_LINE = "Replacement fees: $40 per bin, $80 per dolly.";

interface AddOnLine {
  name: string;
  qty: number;
  lineTotalCents: number;
}

interface BookingEmailData {
  bookingRef: string;
  bookingUrl: string;
  packageName: string;
  binCount: number;
  dollyCount: number;
  labelCount: number;
  deliveryDate: string;
  deliveryAddress: string;
  deliveryZip: string;
  pickupDate: string;
  pickupAddress: string;
  pickupZip: string;
  addOnLines: AddOnLine[];
  extensionDays: number;
  extensionCostCents: number;
  totalPaid: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
}

/** Pulls the 5-digit ZIP off the end of an address built as "street, ZIP" (see BookingForm.tsx). */
function extractZip(address: string): string {
  const match = address.match(/(\d{5})\s*$/);
  return match ? match[1] : "?????";
}

async function buildAddOnLines(prisma: PrismaClient, booking: BookingForEmail): Promise<AddOnLine[]> {
  // Look up by slug regardless of `active` — a booking may reference an
  // add-on that's since been deactivated, and the email must still reflect
  // what was actually purchased (mirrors app/booking/[ref]/page.tsx).
  const addOnRows = await prisma.addOn.findMany({
    where: { slug: { in: [ADD_ON_SLUGS.extraBins, ADD_ON_SLUGS.extraDolly, ADD_ON_SLUGS.blankets] } },
  });
  const bySlug = new Map(addOnRows.map((a) => [a.slug as AddOnSlug, a]));

  const quantities: [AddOnSlug, number][] = [
    [ADD_ON_SLUGS.extraBins, booking.extraBinPacks],
    [ADD_ON_SLUGS.extraDolly, booking.extraDollies],
    [ADD_ON_SLUGS.blankets, booking.blanketPacks],
  ];

  const lines: AddOnLine[] = [];
  for (const [slug, qty] of quantities) {
    if (qty <= 0) continue;
    const addOn = bySlug.get(slug);
    lines.push({ name: addOn?.name ?? slug, qty, lineTotalCents: (addOn?.unitPrice ?? 0) * qty });
  }
  return lines;
}

async function buildBookingEmailData(
  prisma: PrismaClient,
  booking: BookingForEmail,
  amountTotalCents: number
): Promise<BookingEmailData> {
  const addOnLines = await buildAddOnLines(prisma, booking);
  const extensionPricing = computeExtensionPricing(booking.deliveryDate, booking.pickupDate);

  return {
    bookingRef: booking.bookingRef,
    bookingUrl: `${APP_URL}/booking/${booking.bookingRef}`,
    packageName: booking.package.name,
    binCount: booking.package.binCount,
    dollyCount: booking.package.dollyCount,
    labelCount: booking.package.labelCount,
    deliveryDate: formatCalendarDate(booking.deliveryDate),
    deliveryAddress: booking.deliveryAddress,
    deliveryZip: extractZip(booking.deliveryAddress),
    pickupDate: formatCalendarDate(booking.pickupDate),
    pickupAddress: booking.pickupAddress,
    pickupZip: extractZip(booking.pickupAddress),
    addOnLines,
    extensionDays: extensionPricing.extensionDays,
    extensionCostCents: extensionPricing.extensionCost,
    totalPaid: formatCents(amountTotalCents),
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    customerPhone: booking.customerPhone,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function addOnLinesHtml(lines: AddOnLine[]): string {
  if (lines.length === 0) return "<p>No add-ons.</p>";
  const items = lines
    .map((l) => `<li>${escapeHtml(l.name)} &times; ${l.qty} — ${formatCents(l.lineTotalCents)}</li>`)
    .join("");
  return `<ul>${items}</ul>`;
}

function addOnLinesText(lines: AddOnLine[]): string {
  if (lines.length === 0) return "Add-ons: none";
  return ["Add-ons:", ...lines.map((l) => `  - ${l.name} x${l.qty} — ${formatCents(l.lineTotalCents)}`)].join("\n");
}

/** Empty string when there's no extension, so it drops out of the HTML cleanly. */
function extensionLineHtml(data: BookingEmailData): string {
  if (data.extensionDays === 0) return "";
  const dayWord = data.extensionDays === 1 ? "day" : "days";
  return `<p style="margin: 16px 0 4px;">Extra days: ${data.extensionDays} ${dayWord} at ${formatCents(EXTENSION_DAILY_RATE_CENTS)}/day — ${formatCents(data.extensionCostCents)}</p>`;
}

function extensionLineText(data: BookingEmailData): string | null {
  if (data.extensionDays === 0) return null;
  const dayWord = data.extensionDays === 1 ? "day" : "days";
  return `Extra days: ${data.extensionDays} ${dayWord} at ${formatCents(EXTENSION_DAILY_RATE_CENTS)}/day — ${formatCents(data.extensionCostCents)}`;
}

interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function renderCustomerEmail(data: BookingEmailData): RenderedEmail {
  const subject = `Booking ${data.bookingRef} — delivery ${data.deliveryDate}`;

  const html = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.5; color: #171a1a;">
  <h1 style="font-size: 20px; margin: 0 0 4px;">Booking ${escapeHtml(data.bookingRef)}</h1>
  <p style="margin: 0 0 16px;">Your bins are booked. Here's everything for your records.</p>

  <p style="margin: 0 0 4px;"><strong>${escapeHtml(data.packageName)}</strong> — ${data.binCount} bins, ${data.dollyCount} dollies, ${data.labelCount} tags</p>

  <p style="margin: 16px 0 4px;"><strong>Delivery:</strong> ${data.deliveryDate}<br>${escapeHtml(data.deliveryAddress)}</p>
  <p style="margin: 0 0 4px;"><strong>Pickup:</strong> ${data.pickupDate}<br>${escapeHtml(data.pickupAddress)}</p>

  <div style="margin: 16px 0 4px;">${addOnLinesHtml(data.addOnLines)}</div>
  ${extensionLineHtml(data)}

  <p style="margin: 16px 0 4px;"><strong>Total paid:</strong> ${data.totalPaid}</p>

  <p style="margin: 16px 0 4px;">${escapeHtml(TIME_PREFERENCE_EXPECTATION_COPY)}</p>
  <p style="margin: 0 0 4px;">${EXTENSION_RATE_LINE}</p>
  <p style="margin: 0 0 4px;">${REPLACEMENT_FEE_LINE}</p>

  <p style="margin: 16px 0 4px;">Questions? Call or text ${PHONE_DISPLAY}.</p>
  <p style="margin: 0;"><a href="${data.bookingUrl}">${data.bookingUrl}</a></p>
</div>`;

  const text = [
    `Booking ${data.bookingRef}`,
    "",
    "Your bins are booked. Here's everything for your records.",
    "",
    `${data.packageName} — ${data.binCount} bins, ${data.dollyCount} dollies, ${data.labelCount} tags`,
    "",
    `Delivery: ${data.deliveryDate}`,
    data.deliveryAddress,
    "",
    `Pickup: ${data.pickupDate}`,
    data.pickupAddress,
    "",
    addOnLinesText(data.addOnLines),
    "",
    ...(extensionLineText(data) ? [extensionLineText(data)!, ""] : []),
    `Total paid: ${data.totalPaid}`,
    "",
    TIME_PREFERENCE_EXPECTATION_COPY,
    EXTENSION_RATE_LINE,
    REPLACEMENT_FEE_LINE,
    "",
    `Questions? Call or text ${PHONE_DISPLAY}.`,
    data.bookingUrl,
  ].join("\n");

  return { subject, html, text };
}

function renderOperatorEmail(data: BookingEmailData): RenderedEmail {
  const subject = `New booking: ${data.bookingRef} — ${data.packageName} — ${data.deliveryDate} — ${data.deliveryZip}/${data.pickupZip}`;

  const html = `<div style="font-family: sans-serif; font-size: 15px; line-height: 1.5; color: #171a1a;">
  <h1 style="font-size: 20px; margin: 0 0 4px;">${escapeHtml(data.bookingRef)}</h1>

  <p style="margin: 0 0 4px;"><strong>Customer:</strong> ${escapeHtml(data.customerName)} — ${escapeHtml(data.customerPhone)} — ${escapeHtml(data.customerEmail)}</p>

  <p style="margin: 16px 0 4px;"><strong>${escapeHtml(data.packageName)}</strong> — ${data.binCount} bins, ${data.dollyCount} dollies, ${data.labelCount} tags</p>

  <p style="margin: 16px 0 4px;"><strong>Delivery:</strong> ${data.deliveryDate}<br>${escapeHtml(data.deliveryAddress)}</p>
  <p style="margin: 0 0 4px;"><strong>Pickup:</strong> ${data.pickupDate}<br>${escapeHtml(data.pickupAddress)}</p>

  <div style="margin: 16px 0 4px;">${addOnLinesHtml(data.addOnLines)}</div>
  ${extensionLineHtml(data)}

  <p style="margin: 16px 0 4px;"><strong>Total paid:</strong> ${data.totalPaid}</p>
  <p style="margin: 0;"><a href="${data.bookingUrl}">${data.bookingUrl}</a></p>
</div>`;

  const text = [
    data.bookingRef,
    "",
    `Customer: ${data.customerName} — ${data.customerPhone} — ${data.customerEmail}`,
    "",
    `${data.packageName} — ${data.binCount} bins, ${data.dollyCount} dollies, ${data.labelCount} tags`,
    "",
    `Delivery: ${data.deliveryDate}`,
    data.deliveryAddress,
    "",
    `Pickup: ${data.pickupDate}`,
    data.pickupAddress,
    "",
    addOnLinesText(data.addOnLines),
    "",
    ...(extensionLineText(data) ? [extensionLineText(data)!, ""] : []),
    `Total paid: ${data.totalPaid}`,
    data.bookingUrl,
  ].join("\n");

  return { subject, html, text };
}

/**
 * Sends the customer + operator confirmation emails for a just-confirmed
 * booking. Never throws — a Resend failure (or missing config) is logged and
 * swallowed, since a failed email must never fail the webhook or roll back
 * the booking. Call only once per booking (see the confirmationEmailSentAt
 * claim in lib/stripeWebhook.ts) — this function itself has no idempotency
 * guard of its own.
 */
export async function sendBookingConfirmationEmails(
  prisma: PrismaClient,
  booking: BookingForEmail,
  amountTotalCents: number
): Promise<void> {
  const config = getEmailConfig();
  if (!config) return;

  let data: BookingEmailData;
  try {
    data = await buildBookingEmailData(prisma, booking, amountTotalCents);
  } catch (err) {
    console.error(`Failed to assemble confirmation email data for booking ${booking.bookingRef}`, err);
    return;
  }

  const resend = new Resend(config.resendApiKey);
  const customerEmail = renderCustomerEmail(data);
  const operatorEmail = renderOperatorEmail(data);

  const results = await Promise.allSettled([
    resend.emails.send({
      from: config.fromEmail,
      to: booking.customerEmail,
      subject: customerEmail.subject,
      html: customerEmail.html,
      text: customerEmail.text,
    }),
    resend.emails.send({
      from: config.fromEmail,
      to: config.operatorEmail,
      subject: operatorEmail.subject,
      html: operatorEmail.html,
      text: operatorEmail.text,
    }),
  ]);

  const [customerResult, operatorResult] = results;
  logIfFailed(booking.bookingRef, "customer confirmation email", customerResult);
  logIfFailed(booking.bookingRef, "operator notification email", operatorResult);
}

/**
 * The Resend SDK does not throw for API-level failures (invalid address,
 * quota exceeded, etc.) — it resolves with `{ data: null, error }`. Only
 * network-level failures reject the promise. Both must be logged.
 */
function logIfFailed(
  bookingRef: string,
  label: string,
  result: PromiseSettledResult<CreateEmailResponse>
): void {
  if (result.status === "rejected") {
    console.error(`Failed to send ${label} for booking ${bookingRef}`, result.reason);
  } else if (result.value.error) {
    console.error(`Failed to send ${label} for booking ${bookingRef}`, result.value.error);
  }
}
