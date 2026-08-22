"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { PHONE_DISPLAY, PHONE_TEL_HREF } from "@/lib/siteConfig";

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 4);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b border-line bg-paper transition-shadow ${
        scrolled ? "shadow-[0_1px_4px_rgba(23,26,26,0.08)]" : ""
      }`}
    >
      <div className="mx-auto flex max-w-container items-center justify-between px-6 py-4 md:px-10">
        <Link href="/" className="flex items-center">
          <Image
            src="/wordmark.png"
            alt="Move It Units"
            width={2000}
            height={400}
            priority
            className="h-[39px] w-auto"
          />
        </Link>
        <div className="flex flex-col items-end gap-1">
          <Link
            href="/book"
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-ink"
          >
            Book now
          </Link>
          {/* The phone link duplicates what's in the footer — dropped below
              sm so the header stays a single comfortable row on phones. */}
          <a
            href={PHONE_TEL_HREF}
            className="hidden text-sm font-semibold text-accent underline-offset-2 hover:underline sm:block"
          >
            {PHONE_DISPLAY}
          </a>
        </div>
      </div>
    </header>
  );
}
