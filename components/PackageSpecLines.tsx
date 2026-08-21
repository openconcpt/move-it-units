interface PackageSpecLinesProps {
  binCount: number;
  dollyCount: number;
  labelCount: number;
  className?: string;
}

/** Bins/dollies/labels spec lines, shared so every package listing renders them identically. */
export function PackageSpecLines({ binCount, dollyCount, labelCount, className }: PackageSpecLinesProps) {
  return (
    <div className={className}>
      <p className="font-mono text-sm tabular-nums text-muted">
        {binCount} bins &middot; {dollyCount} {dollyCount === 1 ? "dolly" : "dollies"}
      </p>
      <p className="font-mono text-sm tabular-nums text-muted">{labelCount} labels</p>
    </div>
  );
}
