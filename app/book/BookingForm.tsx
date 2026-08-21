"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { formatCents } from "@/lib/format";
import { isZipInServiceArea, normalizeZip, SERVICE_AREA_CONTACT_EMAIL } from "@/lib/serviceArea";
import { ADD_ON_SLUGS, type AddOnSlug } from "@/lib/addOns";
import { PackageSpecLines } from "@/components/PackageSpecLines";

interface PackageOption {
  id: string;
  name: string;
  binCount: number;
  dollyCount: number;
  labelCount: number;
  basePrice: number;
}

interface AddOnOption {
  id: string;
  slug: string;
  name: string;
  unitPrice: number;
  binsPerUnit: number;
  dolliesPerUnit: number;
  blanketsPerUnit: number;
}

interface BookingFormProps {
  packages: PackageOption[];
  addOns: AddOnOption[];
  preselectedPackageId?: string;
}

type AvailabilityState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "available" }
  | { status: "unavailable"; reason: string | null }
  | { status: "error" };

type ZipState = "idle" | "invalid" | "out-of-area" | "ok";

type AddOnQuantities = Record<AddOnSlug, number>;

const ADD_ON_MAX: Record<AddOnSlug, number> = {
  [ADD_ON_SLUGS.extraBins]: 5,
  [ADD_ON_SLUGS.extraDolly]: 5,
  [ADD_ON_SLUGS.blankets]: 3,
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function zipStatusFor(raw: string): ZipState {
  if (raw.trim() === "") return "idle";
  const normalized = normalizeZip(raw);
  if (!normalized) return "invalid";
  return isZipInServiceArea(raw) ? "ok" : "out-of-area";
}

/** e.g. "10 bins" / "1 dolly" / "6 blankets" — describes what one unit of an add-on provides. */
function addOnUnitDescription(addOn: AddOnOption): string | null {
  if (addOn.binsPerUnit > 0) return `${addOn.binsPerUnit} bins`;
  if (addOn.dolliesPerUnit > 0) return `${addOn.dolliesPerUnit} ${addOn.dolliesPerUnit === 1 ? "dolly" : "dollies"}`;
  if (addOn.blanketsPerUnit > 0) return `${addOn.blanketsPerUnit} blankets`;
  return null;
}

export function BookingForm({ packages, addOns, preselectedPackageId }: BookingFormProps) {
  const defaultPackageId =
    (preselectedPackageId && packages.some((p) => p.id === preselectedPackageId)
      ? preselectedPackageId
      : packages[0]?.id) ?? "";

  const [packageId, setPackageId] = useState(defaultPackageId);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [pickupDate, setPickupDate] = useState("");

  const [quantities, setQuantities] = useState<AddOnQuantities>({
    [ADD_ON_SLUGS.extraBins]: 0,
    [ADD_ON_SLUGS.extraDolly]: 0,
    [ADD_ON_SLUGS.blankets]: 0,
  });

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [deliveryStreet, setDeliveryStreet] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [sameAsDelivery, setSameAsDelivery] = useState(true);
  const [pickupStreet, setPickupStreet] = useState("");
  const [pickupZip, setPickupZip] = useState("");

  const [availability, setAvailability] = useState<AvailabilityState>({ status: "idle" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selectedPackage = packages.find((p) => p.id === packageId) ?? null;
  const deliveryZipStatus = zipStatusFor(deliveryZip);
  const pickupZipStatus = sameAsDelivery ? deliveryZipStatus : zipStatusFor(pickupZip);

  const extraBinPacks = quantities[ADD_ON_SLUGS.extraBins];
  const extraDollies = quantities[ADD_ON_SLUGS.extraDolly];
  const blanketPacks = quantities[ADD_ON_SLUGS.blankets];

  const datesLookValid =
    deliveryDate !== "" && pickupDate !== "" && pickupDate >= deliveryDate;

  // Debounced live availability check whenever the package, dates, or any
  // add-on quantity changes.
  useEffect(() => {
    if (!packageId || !datesLookValid) {
      setAvailability({ status: "idle" });
      return;
    }

    setAvailability({ status: "checking" });
    const controller = new AbortController();

    const timeoutId = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          packageId,
          deliveryDate,
          pickupDate,
          extraBinPacks: String(extraBinPacks),
          extraDollies: String(extraDollies),
          blanketPacks: String(blanketPacks),
        });
        const res = await fetch(`/api/availability?${params.toString()}`, {
          signal: controller.signal,
        });
        const body = await res.json();

        if (!res.ok) {
          setAvailability({ status: "error" });
          return;
        }

        setAvailability(
          body.available
            ? { status: "available" }
            : { status: "unavailable", reason: body.reason ?? null }
        );
      } catch (err) {
        if ((err as { name?: string }).name !== "AbortError") {
          setAvailability({ status: "error" });
        }
      }
    }, 400);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [packageId, deliveryDate, pickupDate, datesLookValid, extraBinPacks, extraDollies, blanketPacks]);

  const formError = useMemo(() => {
    if (deliveryZipStatus === "invalid") return "Enter a 5-digit delivery ZIP code.";
    if (!sameAsDelivery && pickupZipStatus === "invalid") {
      return "Enter a 5-digit pickup ZIP code.";
    }
    return null;
  }, [deliveryZipStatus, pickupZipStatus, sameAsDelivery]);

  const addOnLines = addOns
    .map((addOn) => {
      const qty = quantities[addOn.slug as AddOnSlug] ?? 0;
      return { addOn, qty, lineTotal: addOn.unitPrice * qty };
    })
    .filter((line) => line.qty > 0);

  const totalCents =
    (selectedPackage?.basePrice ?? 0) + addOnLines.reduce((sum, line) => sum + line.lineTotal, 0);

  const canSubmit =
    selectedPackage !== null &&
    datesLookValid &&
    customerName.trim() !== "" &&
    customerEmail.trim() !== "" &&
    customerPhone.trim() !== "" &&
    deliveryStreet.trim() !== "" &&
    deliveryZipStatus === "ok" &&
    (sameAsDelivery || (pickupStreet.trim() !== "" && pickupZipStatus === "ok")) &&
    availability.status !== "unavailable" &&
    !submitting;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    if (!selectedPackage) return;

    const finalPickupStreet = sameAsDelivery ? deliveryStreet : pickupStreet;
    const finalPickupZip = sameAsDelivery ? deliveryZip : pickupZip;

    setSubmitting(true);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: selectedPackage.id,
          customerName,
          customerEmail,
          customerPhone,
          deliveryAddress: `${deliveryStreet}, ${normalizeZip(deliveryZip)}`,
          pickupAddress: `${finalPickupStreet}, ${normalizeZip(finalPickupZip)}`,
          deliveryZip,
          pickupZip: finalPickupZip,
          deliveryDate,
          pickupDate,
          extraBinPacks,
          extraDollies,
          blanketPacks,
        }),
      });

      const body = await res.json();

      if (!res.ok) {
        setSubmitError(body.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }

      window.location.href = body.checkoutUrl;
    } catch {
      setSubmitError("Something went wrong. Please check your connection and try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg font-bold">Package &amp; dates</legend>

        <Field label="Package">
          <select
            value={packageId}
            onChange={(e) => setPackageId(e.target.value)}
            className={selectClass}
          >
            {packages.map((pkg) => (
              <option key={pkg.id} value={pkg.id}>
                {pkg.name} — {formatCents(pkg.basePrice)}
              </option>
            ))}
          </select>
        </Field>

        {selectedPackage && (
          <PackageSpecLines
            binCount={selectedPackage.binCount}
            dollyCount={selectedPackage.dollyCount}
            labelCount={selectedPackage.labelCount}
            className="-mt-2 flex flex-col gap-0.5"
          />
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Delivery date">
            <input
              type="date"
              required
              min={todayIsoDate()}
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="Pickup date">
            <input
              type="date"
              required
              min={deliveryDate || todayIsoDate()}
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>

        <AvailabilityBanner state={availability} />
      </fieldset>

      {addOns.length > 0 && (
        <fieldset className="flex flex-col gap-3">
          <legend className="font-display text-lg font-bold">Add-ons</legend>

          {addOns.map((addOn) => {
            const slug = addOn.slug as AddOnSlug;
            const unitDescription = addOnUnitDescription(addOn);
            return (
              <QuantityStepper
                key={addOn.id}
                label={addOn.name}
                priceLabel={
                  unitDescription
                    ? `${formatCents(addOn.unitPrice)} for ${unitDescription}`
                    : formatCents(addOn.unitPrice)
                }
                value={quantities[slug] ?? 0}
                onChange={(next) => setQuantities((prev) => ({ ...prev, [slug]: next }))}
                min={0}
                max={ADD_ON_MAX[slug] ?? 5}
              />
            );
          })}
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg font-bold">Your info</legend>

        <Field label="Full name">
          <input
            type="text"
            required
            autoComplete="name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            required
            autoComplete="email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            required
            autoComplete="tel"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className={inputClass}
          />
        </Field>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg font-bold">Delivery address</legend>

        <Field label="Street, city, state">
          <input
            type="text"
            required
            autoComplete="street-address"
            value={deliveryStreet}
            onChange={(e) => setDeliveryStreet(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="ZIP code">
          <input
            type="text"
            inputMode="numeric"
            required
            autoComplete="postal-code"
            value={deliveryZip}
            onChange={(e) => setDeliveryZip(e.target.value)}
            className={inputClass}
          />
        </Field>
        <ZipNotice status={deliveryZipStatus} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="font-display text-lg font-bold">Pickup address</legend>

        <label className="flex items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={sameAsDelivery}
            onChange={(e) => setSameAsDelivery(e.target.checked)}
            className="h-5 w-5 rounded border-line text-accent focus-visible:outline-accent"
          />
          Same as delivery address
        </label>

        {!sameAsDelivery && (
          <>
            <Field label="Street, city, state">
              <input
                type="text"
                required
                value={pickupStreet}
                onChange={(e) => setPickupStreet(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="ZIP code">
              <input
                type="text"
                inputMode="numeric"
                required
                value={pickupZip}
                onChange={(e) => setPickupZip(e.target.value)}
                className={inputClass}
              />
            </Field>
            <ZipNotice status={pickupZipStatus} />
          </>
        )}
      </fieldset>

      {selectedPackage && (
        <div className="rounded-2xl border border-line bg-surface p-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-sm">
              <span>{selectedPackage.name}</span>
              <span className="tabular-nums">{formatCents(selectedPackage.basePrice)}</span>
            </div>
            {addOnLines.map(({ addOn, qty, lineTotal }) => (
              <div key={addOn.id} className="flex items-baseline justify-between text-sm text-muted">
                <span>
                  {addOn.name} &times; {qty}
                </span>
                <span className="tabular-nums">{formatCents(lineTotal)}</span>
              </div>
            ))}
          </div>

          <div className="mt-3 flex items-baseline justify-between border-t border-line pt-3">
            <span className="font-semibold">Total due today</span>
            <span className="font-display text-2xl font-extrabold tabular-nums">
              {formatCents(totalCents)}
            </span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Covers delivery, one week of use, and pickup. Extra days are $10/day, billed to the
            card on file.
          </p>
        </div>
      )}

      {formError && <p className="text-sm text-danger">{formError}</p>}
      {submitError && <p className="text-sm text-danger">{submitError}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded-full bg-accent px-6 py-4 text-base font-semibold text-white transition-colors hover:bg-accent-ink disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
      >
        {submitting ? "Redirecting to payment…" : "Continue to payment"}
      </button>
    </form>
  );
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface px-4 py-3 text-base text-ink outline-none transition-colors focus:border-accent";
const selectClass = inputClass;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

function QuantityStepper({
  label,
  priceLabel,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  priceLabel: string;
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-sm text-muted">{priceLabel}</p>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          aria-label={`Decrease ${label} quantity`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg font-semibold transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
        >
          −
        </button>
        <span className="w-4 text-center text-base font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          aria-label={`Increase ${label} quantity`}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line text-lg font-semibold transition-colors hover:border-accent disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line"
        >
          +
        </button>
      </div>
    </div>
  );
}

function AvailabilityBanner({ state }: { state: AvailabilityState }) {
  if (state.status === "idle") return null;

  if (state.status === "checking") {
    return <p className="text-sm text-muted">Checking availability…</p>;
  }

  if (state.status === "available") {
    return <p className="text-sm font-medium text-accent-ink">These dates are open.</p>;
  }

  if (state.status === "unavailable") {
    return (
      <p className="text-sm font-medium text-danger">
        Those dates aren&apos;t available for this package and add-ons. Try different dates,
        fewer add-ons, or a smaller package.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted">
      Couldn&apos;t check availability right now — you can still submit and we&apos;ll confirm.
    </p>
  );
}

function ZipNotice({ status }: { status: ZipState }) {
  if (status === "invalid") {
    return <p className="text-sm text-danger">Enter a 5-digit ZIP code.</p>;
  }
  if (status === "out-of-area") {
    return (
      <p className="text-sm text-danger">
        We don&apos;t deliver to that ZIP code yet. Email{" "}
        <a href={`mailto:${SERVICE_AREA_CONTACT_EMAIL}`} className="underline">
          {SERVICE_AREA_CONTACT_EMAIL}
        </a>{" "}
        and we&apos;ll let you know if we can make an exception.
      </p>
    );
  }
  return null;
}
