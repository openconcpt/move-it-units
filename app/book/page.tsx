import { prisma } from "@/lib/prisma";
import { BookingForm } from "./BookingForm";

interface BookPageProps {
  searchParams: Promise<{ package?: string }>;
}

export default async function BookPage({ searchParams }: BookPageProps) {
  const [packages, addOns, { package: preselectedPackageId }] = await Promise.all([
    prisma.package.findMany({
      where: { active: true },
      orderBy: { basePrice: "asc" },
    }),
    // Inactive add-ons (e.g. blankets, until we own any) must not render.
    prisma.addOn.findMany({
      where: { active: true },
      orderBy: { unitPrice: "asc" },
    }),
    searchParams,
  ]);

  return (
    <div className="mx-auto max-w-content px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
        Book your bins
      </h1>
      <p className="mt-2 max-w-lg text-muted">
        Pick a package and your dates. We&apos;ll confirm availability before you pay.
      </p>

      <div className="mt-10 max-w-xl">
        <BookingForm packages={packages} addOns={addOns} preselectedPackageId={preselectedPackageId} />
      </div>
    </div>
  );
}
