import type { ReactNode } from "react";

interface FaqItemProps {
  question: string;
  children: ReactNode;
}

export function FaqItem({ question, children }: FaqItemProps) {
  return (
    <details className="group border-b border-line py-5 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-display text-base font-semibold">
        {question}
        <span
          aria-hidden
          className="shrink-0 text-xl font-normal text-muted transition-transform group-open:rotate-45"
        >
          +
        </span>
      </summary>
      <p className="mt-3 text-sm leading-relaxed text-muted">{children}</p>
    </details>
  );
}
