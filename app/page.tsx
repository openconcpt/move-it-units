import Link from "next/link";
import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { PackageCard } from "@/components/PackageCard";
import { FaqItem } from "@/components/FaqItem";

// Packages/pricing come from the DB — revalidate periodically rather than
// baking prices into the static build forever.
export const revalidate = 60;

const STEPS = [
  {
    label: "Pick a package and your dates",
    detail: "Choose bins and dollies for your move, then tell us when to deliver and when to pick up.",
  },
  {
    label: "We deliver clean bins to your door",
    detail: "Washed and inspected bins show up on your delivery date, ready to pack.",
  },
  {
    label: "We pick them up when you're done",
    detail: "Leave them out on your pickup date. No folding, no hauling to a recycling bin.",
  },
];

export default async function HomePage() {
  const packages = await prisma.package.findMany({
    where: { active: true },
    orderBy: { basePrice: "asc" },
  });

  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-container items-center gap-10 px-6 py-16 md:px-10 md:py-24 lg:grid-cols-[1fr_1.1fr] lg:gap-12">
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
              No boxes. No tape. No cardboard pile in your garage after.
            </h1>
            <p className="mt-6 max-w-prose text-lg leading-relaxed text-muted">
              We deliver clean, stackable bins to your door. You pack at your own pace. We pick
              them up when you&apos;re done.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                href="/book"
                className="rounded-full bg-accent px-6 py-3.5 text-base font-semibold text-white transition-colors hover:bg-accent-ink"
              >
                Book your bins
              </Link>
              <a href="#packages" className="text-base font-semibold text-ink underline underline-offset-4">
                See packages
              </a>
            </div>
          </div>
          <Image
            src="/hero-bin.png"
            alt="A stackable moving bin with a blue write-on tag reading Kitchen tied to the lid"
            width={1536}
            height={1024}
            priority
            className="h-auto w-full"
          />
        </div>
      </section>

      <div className="border-b border-line bg-accent-soft">
        <div className="mx-auto max-w-container px-6 py-3 md:px-10">
          <p className="text-sm font-semibold text-accent-ink">
            Now serving Palm Beach County, FL.
          </p>
        </div>
      </div>

      <section id="packages" className="scroll-mt-[76px] border-b border-line sm:scroll-mt-[97px]">
        <div className="mx-auto max-w-container px-6 py-16 md:px-10 md:py-24">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Packages</h2>
          <p className="mt-2 text-muted">
            Every package includes delivery, one week of use, and pickup.
          </p>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {packages.map((pkg) => (
              <PackageCard
                key={pkg.id}
                id={pkg.id}
                name={pkg.name}
                binCount={pkg.binCount}
                dollyCount={pkg.dollyCount}
                labelCount={pkg.labelCount}
                basePrice={pkg.basePrice}
              />
            ))}
          </div>
          <p className="mt-6 text-sm text-muted">
            Every kit ships with a write-on tag on a zip tie that seals the bin closed, gives you
            a place to note what&apos;s inside, and leaves nothing to peel off afterward.
          </p>
        </div>
      </section>

      <section className="border-b border-line">
        <div className="mx-auto max-w-container px-6 py-16 md:px-10 md:py-24">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">How it works</h2>
          <ol className="mt-10 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((step, index) => (
              <li key={step.label}>
                <span className="font-display text-sm font-bold tabular-nums text-accent">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-3 font-display text-lg font-bold">{step.label}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="questions" className="scroll-mt-[76px] sm:scroll-mt-[97px]">
        <div className="mx-auto max-w-container px-6 py-16 md:px-10 md:py-24">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Questions</h2>
          <div className="mt-8 max-w-prose">
            <FaqItem question="What if I need the bins longer than a week?">
              It&apos;s $10 per day, billed automatically to the card on file. No need to call —
              just let us know how much extra time you need.
            </FaqItem>
            <FaqItem question="What areas do you serve?">
              We currently serve Palm Beach County, FL, except the far-western county (Belle
              Glade, Pahokee, and South Bay). Enter your ZIP code on the booking page and
              we&apos;ll tell you right away whether
              you&apos;re in range.
            </FaqItem>
            <FaqItem question="What if a bin breaks or goes missing?">
              Normal wear is on us. A lost or badly damaged bin or dolly is billed at a flat
              replacement fee, charged to the card on file.
            </FaqItem>
            <FaqItem question="How clean are the bins?">
              Every bin is washed and inspected before it leaves our warehouse. If one arrives
              less than spotless, tell us and we&apos;ll make it right.
            </FaqItem>
          </div>
        </div>
      </section>
    </>
  );
}
