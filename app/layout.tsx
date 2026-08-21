import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import type { ReactNode } from "react";
import Link from "next/link";
import "./globals.css";
import { PHONE_DISPLAY, PHONE_TEL_HREF } from "@/lib/siteConfig";

const display = Archivo({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-display",
  display: "swap",
});

const body = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Move It Units — Moving bins, delivered",
  description:
    "Clean moving bins delivered to your door, picked up when you're done. No boxes to buy, no tape, no cardboard pile in your garage afterward.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable} ${body.variable}`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex max-w-container items-center justify-between px-6 py-4 md:px-10">
            <Link href="/" className="flex items-center gap-3 font-display text-lg font-bold tracking-tight">
              <svg viewBox="0 0 64 64" width="36" height="36" className="h-9 w-9 shrink-0" aria-hidden="true">
                <g fill="#6B7370">
                  <rect x="3" y="16" width="24" height="6" rx="1.2" />
                  <rect x="37" y="16" width="24" height="6" rx="1.2" />
                  <path d="M8 24 H56 L49.5 55.5 A2 2 0 0 1 47.5 57 H16.5 A2 2 0 0 1 14.5 55.5 Z" />
                </g>
                <rect x="30" y="11" width="4" height="19" rx="1.5" fill="#1F6FC4" />
                <rect x="20" y="28" width="24" height="15" rx="2.5" fill="#1F6FC4" />
                <rect x="23.5" y="31" width="17" height="9" rx="1.2" fill="#FFFFFF" />
              </svg>
              Move It <span className="text-accent">Units</span>
            </Link>
            <div className="flex flex-col items-end gap-1">
              <Link
                href="/book"
                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-ink"
              >
                Book now
              </Link>
              <a
                href={PHONE_TEL_HREF}
                className="text-sm font-semibold text-accent underline-offset-2 hover:underline"
              >
                {PHONE_DISPLAY}
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1">{children}</main>

        <footer className="border-t border-line bg-paper">
          <div className="mx-auto max-w-container px-6 py-8 text-sm text-muted md:px-10">
            <p>Move It Units — clean bins, delivered and picked up. No cardboard required.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
