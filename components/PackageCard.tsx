import Link from "next/link";
import { formatCents } from "@/lib/format";

interface PackageCardProps {
  id: string;
  name: string;
  binCount: number;
  dollyCount: number;
  basePrice: number;
}

export function PackageCard({ id, name, binCount, dollyCount, basePrice }: PackageCardProps) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="p-6">
        <h3 className="font-display text-xl font-bold">{name}</h3>
        <p className="mt-1 font-mono text-sm tabular-nums text-muted">
          {binCount} bins &middot; {dollyCount} {dollyCount === 1 ? "dolly" : "dollies"}
        </p>
      </div>

      <div className="ticket-tear" />

      <div className="flex flex-col p-6">
        <p className="font-display text-4xl font-extrabold tracking-tight">
          {formatCents(basePrice)}
          <span className="font-sans text-base font-medium text-muted"> /week</span>
        </p>
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
