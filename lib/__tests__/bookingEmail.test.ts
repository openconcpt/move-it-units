import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

const sendMock = vi.fn();
const ResendMock = vi.fn().mockImplementation(() => ({ emails: { send: sendMock } }));
vi.mock("resend", () => ({ Resend: ResendMock }));

const { sendBookingConfirmationEmails } = await import("../bookingEmail");

const ADD_ON_CATALOG = [
  {
    slug: "extra-bins",
    name: "Extra bin pack",
    unitPrice: 2900,
    binsPerUnit: 10,
    dolliesPerUnit: 0,
    blanketsPerUnit: 0,
    active: true,
  },
  {
    slug: "extra-dolly",
    name: "Extra dolly",
    unitPrice: 1900,
    binsPerUnit: 0,
    dolliesPerUnit: 1,
    blanketsPerUnit: 0,
    active: true,
  },
  {
    slug: "blankets",
    name: "Blanket pack",
    unitPrice: 2500,
    binsPerUnit: 0,
    dolliesPerUnit: 0,
    blanketsPerUnit: 6,
    active: false,
  },
];

function fakeBooking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking_1",
    bookingRef: "MVU-7K2P9Q",
    customerName: "Jane Doe",
    customerEmail: "jane@example.com",
    customerPhone: "555-123-4567",
    deliveryAddress: "123 Main St, 33401",
    pickupAddress: "123 Main St, 33401",
    deliveryDate: new Date("2026-09-01T00:00:00.000Z"),
    pickupDate: new Date("2026-09-05T00:00:00.000Z"),
    timePreference: "NO_PREFERENCE",
    status: "confirmed",
    extraBinPacks: 1,
    extraDollies: 0,
    blanketPacks: 0,
    confirmationEmailSentAt: null,
    package: {
      id: "pkg_1",
      slug: "studio-1br",
      name: "Studio/1BR",
      binCount: 20,
      dollyCount: 2,
      labelCount: 20,
      basePrice: 14900,
      active: true,
    },
    ...overrides,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function fakePrisma(addOnRows: Record<string, unknown>[] = ADD_ON_CATALOG) {
  return {
    addOn: { findMany: vi.fn(async () => addOnRows) },
  } as unknown as PrismaClient;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  sendMock.mockReset();
  ResendMock.mockClear();
  sendMock.mockResolvedValue({ data: { id: "email_1" }, error: null });
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("FROM_EMAIL", "bookings@moveitunits.com");
  vi.stubEnv("OPERATOR_EMAIL", "ops@moveitunits.com");
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  consoleErrorSpy.mockRestore();
});

describe("sendBookingConfirmationEmails", () => {
  it("sends exactly two emails: one to the customer, one to the operator", async () => {
    const prisma = fakePrisma();
    await sendBookingConfirmationEmails(prisma, fakeBooking(), 17800);

    expect(sendMock).toHaveBeenCalledTimes(2);
    const [customerCall, operatorCall] = sendMock.mock.calls.map((c) => c[0]);

    expect(customerCall.to).toBe("jane@example.com");
    expect(customerCall.from).toBe("bookings@moveitunits.com");
    expect(operatorCall.to).toBe("ops@moveitunits.com");
    expect(operatorCall.from).toBe("bookings@moveitunits.com");
  });

  it("customer email subject has the booking reference and the delivery date", async () => {
    const prisma = fakePrisma();
    await sendBookingConfirmationEmails(prisma, fakeBooking(), 17800);

    const [customerCall] = sendMock.mock.calls.map((c) => c[0]);
    expect(customerCall.subject).toContain("MVU-7K2P9Q");
    expect(customerCall.subject).toContain("Sep 1, 2026");
  });

  it("customer email body covers every required piece of booking data", async () => {
    const prisma = fakePrisma();
    await sendBookingConfirmationEmails(prisma, fakeBooking(), 17800);

    const [customerCall] = sendMock.mock.calls.map((c) => c[0]);
    const { html, text } = customerCall;

    for (const body of [html, text]) {
      expect(body).toContain("MVU-7K2P9Q");
      expect(body).toContain("Studio/1BR");
      expect(body).toContain("20 bins");
      expect(body).toContain("2 dollies");
      expect(body).toContain("20 labels");
      expect(body).toContain("Sep 1, 2026"); // delivery date
      expect(body).toContain("Sep 5, 2026"); // pickup date
      expect(body).toContain("123 Main St, 33401");
      expect(body).toContain("Extra bin pack");
      expect(body).toContain("$178"); // total paid (17800 cents)
      expect(body).toContain("two-hour window");
      expect(body).toContain("$10 per day");
      expect(body).toContain("$40 per bin");
      expect(body).toContain("$80 per dolly");
      expect(body).toContain("(561) 888-0801");
      expect(body).toContain("/booking/MVU-7K2P9Q");
    }

    // Voice check: no marketing exclamation points anywhere in the customer email.
    expect(html).not.toContain("!");
    expect(text).not.toContain("!");
  });

  it("operator email subject is prefixed for filtering and includes package, delivery date, and both ZIPs", async () => {
    const prisma = fakePrisma();
    const booking = fakeBooking({
      deliveryAddress: "123 Main St, 33401",
      pickupAddress: "456 Oak Ave, 33403",
    });

    await sendBookingConfirmationEmails(prisma, booking, 17800);

    const [, operatorCall] = sendMock.mock.calls.map((c) => c[0]);
    expect(operatorCall.subject).toMatch(/^New booking:/);
    expect(operatorCall.subject).toContain("MVU-7K2P9Q");
    expect(operatorCall.subject).toContain("Studio/1BR");
    expect(operatorCall.subject).toContain("Sep 1, 2026");
    expect(operatorCall.subject).toContain("33401");
    expect(operatorCall.subject).toContain("33403");
  });

  it("operator email includes the customer's name and phone", async () => {
    const prisma = fakePrisma();
    await sendBookingConfirmationEmails(prisma, fakeBooking(), 17800);

    const [, operatorCall] = sendMock.mock.calls.map((c) => c[0]);
    expect(operatorCall.html).toContain("Jane Doe");
    expect(operatorCall.html).toContain("555-123-4567");
    expect(operatorCall.text).toContain("Jane Doe");
    expect(operatorCall.text).toContain("555-123-4567");
  });

  it("looks up add-ons regardless of active status, mirroring the confirmation page", async () => {
    const prisma = fakePrisma(ADD_ON_CATALOG); // "blankets" is inactive in the catalog
    const booking = fakeBooking({ extraBinPacks: 0, blanketPacks: 1 });

    await sendBookingConfirmationEmails(prisma, booking, 14900 + 2500);

    const [customerCall] = sendMock.mock.calls.map((c) => c[0]);
    expect(customerCall.html).toContain("Blanket pack");
  });

  it("includes an extra-days line when the stay runs past the included week, and omits it when it doesn't", async () => {
    const prisma = fakePrisma();
    const longBooking = fakeBooking({
      deliveryDate: new Date("2026-09-01T00:00:00.000Z"),
      pickupDate: new Date("2026-09-09T00:00:00.000Z"), // 8 days apart -> 1 extension day
    });

    await sendBookingConfirmationEmails(prisma, longBooking, 17800 + 1000);

    const [customerCall, operatorCall] = sendMock.mock.calls.map((c) => c[0]);
    for (const body of [customerCall.html, customerCall.text, operatorCall.html, operatorCall.text]) {
      expect(body).toContain("Extra days");
      expect(body).toContain("1 day");
      expect(body).toContain("$10");
    }
  });

  it("omits the extra-days line for a stay within the included week", async () => {
    const prisma = fakePrisma();
    await sendBookingConfirmationEmails(prisma, fakeBooking(), 17800); // default booking is 4 days apart

    const [customerCall] = sendMock.mock.calls.map((c) => c[0]);
    expect(customerCall.html).not.toContain("Extra days:");
    expect(customerCall.text).not.toContain("Extra days:");
  });

  it("skips sending entirely when required email config is missing, and logs an error", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    const prisma = fakePrisma();

    await sendBookingConfirmationEmails(prisma, fakeBooking(), 14900);

    expect(sendMock).not.toHaveBeenCalled();
    expect(ResendMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not throw when Resend rejects (network failure)", async () => {
    sendMock.mockRejectedValueOnce(new Error("network down"));
    const prisma = fakePrisma();

    await expect(sendBookingConfirmationEmails(prisma, fakeBooking(), 14900)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not throw when Resend resolves with an API-level error (the SDK does not throw for these)", async () => {
    sendMock.mockResolvedValue({
      data: null,
      error: { message: "Invalid `from` address", statusCode: 422, name: "validation_error" },
    });
    const prisma = fakePrisma();

    await expect(sendBookingConfirmationEmails(prisma, fakeBooking(), 14900)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });

  it("does not throw when the add-on lookup itself fails", async () => {
    const prisma = {
      addOn: { findMany: vi.fn(async () => { throw new Error("db down"); }) },
    } as unknown as PrismaClient;

    await expect(sendBookingConfirmationEmails(prisma, fakeBooking(), 14900)).resolves.toBeUndefined();
    expect(sendMock).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
