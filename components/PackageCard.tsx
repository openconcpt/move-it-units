import Link from "next/link";
import { formatCents } from "@/lib/format";
import { PackageSpecLines } from "@/components/PackageSpecLines";

interface PackageCardProps {
  id: string;
  name: string;
  binCount: number;
  dollyCount: number;
  labelCount: number;
  basePrice: number;
}

export function PackageCard({ id, name, binCount, dollyCount, labelCount, basePrice }: PackageCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="p-6">
        <h3 className="font-display text-xl font-bold">{name}</h3>
        <PackageSpecLines
          binCount={binCount}
          dollyCount={dollyCount}
          labelCount={labelCount}
          className="mt-1 flex flex-col gap-0.5"
        />
      </div>

      <div className="ticket-tear" />

      <div className="flex flex-col p-6">
        <p className="font-display text-4xl font-extrabold tracking-tight">{formatCents(basePrice)}</p>
        <p className="mt-2 text-sm text-muted">1 week included &middot; delivery &amp; pickup included</p>

        <Link
          href={`/book?package=${id}`}
          className="mt-6 rounded-full bg-accent px-5 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-accent-ink"
        >
          Book this package
        </Link>
      </div>
    </div>
  );
}
