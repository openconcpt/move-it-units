import type { Metadata } from "next";
import { Archivo, Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

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
        <SiteHeader />

        <main className="flex-1">{children}</main>

        <SiteFooter />
      </body>
    </html>
  );
}
