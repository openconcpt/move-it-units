import type { Metadata } from "next";
import { CONTACT_EMAIL, PHONE_DISPLAY } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: "Terms — Move It Units",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-container px-6 py-16 md:px-10 md:py-24">
      <div className="max-w-prose">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Terms</h1>
        <p className="mt-4 text-muted">
          These are the terms of renting bins from Move It Units. Booking a package means you
          agree to them.
        </p>

        <div className="mt-10 flex flex-col gap-8">
          <section>
            <h2 className="font-display text-lg font-bold">Rental period</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Each package includes one week of use, counted from your delivery date to your
              pickup date. Extra days are $10 per day, billed automatically to the card on file.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Payment</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Payment is due at booking. Your card is saved on file so we can charge extension
              days or a replacement fee without contacting you first.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Damaged or missing items</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Normal wear is on us. A bin or dolly that&apos;s lost or damaged beyond normal wear
              is billed at a flat replacement fee: $40 per bin, $80 per dolly.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Delivery and pickup</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              We&apos;ll text you the afternoon before each trip with a two-hour window. Your
              time-of-day preference helps us plan the route, but we can&apos;t guarantee a
              specific time.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Service area</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              We currently serve Palm Beach County, FL, except the far-western county (Belle
              Glade, Pahokee, and South Bay).
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Changes to these terms</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              We may update these terms as the business changes. The version in effect at the
              time you book is the one that applies to your rental.
            </p>
          </section>

          <section>
            <h2 className="font-display text-lg font-bold">Questions</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Call or text {PHONE_DISPLAY}, or email{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="underline">
                {CONTACT_EMAIL}
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
