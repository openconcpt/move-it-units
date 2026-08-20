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
  title: "MoveItUnits — Moving bins, delivered",
  description:
    "Clean moving bins delivered to your door, picked up when you're done. No boxes to buy, no tape, no cardboard pile in your garage afterward.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`h-full antialiased ${display.variable} ${body.variable}`}>
      <body className="flex min-h-full flex-col bg-paper font-sans text-ink">
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex max-w-content items-center justify-between px-5 py-4 sm:px-8">
            <Link href="/" className="font-display text-lg font-bold tracking-tight">
              MoveIt<span className="text-accent">Units</span>
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
          <div className="mx-auto max-w-content px-5 py-8 text-sm text-muted sm:px-8">
            <p>MoveItUnits — clean bins, delivered and picked up. No cardboard required.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
