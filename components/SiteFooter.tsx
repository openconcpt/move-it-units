import Link from "next/link";
import Image from "next/image";
import { CONTACT_EMAIL, PHONE_DISPLAY, PHONE_TEL_HREF, REGISTERED_ENTITY_NAME } from "@/lib/siteConfig";

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-structural-soft">
      <div className="mx-auto max-w-container px-6 py-12 md:px-10 md:py-16">
        <div className="grid gap-10 md:grid-cols-3">
          <div>
            <Image src="/wordmark.png" alt="Move It Units" width={2000} height={400} className="h-8 w-auto" />
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Clean bins, delivered and picked up. No cardboard required.
            </p>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold">Contact</h2>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
              <li>
                <a href={PHONE_TEL_HREF} className="hover:text-ink hover:underline">
                  {PHONE_DISPLAY}
                </a>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li>Serving Palm Beach County, FL.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-sm font-bold">Links</h2>
            <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
              <li>
                <Link href="/book" className="hover:text-ink hover:underline">
                  Book now
                </Link>
              </li>
              <li>
                <Link href="/#packages" className="hover:text-ink hover:underline">
                  Packages
                </Link>
              </li>
              <li>
                <Link href="/#questions" className="hover:text-ink hover:underline">
                  Questions
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-ink hover:underline">
                  Terms
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-line pt-6 text-xs text-muted">
          <p>
            &copy; {new Date().getFullYear()} Move It Units. Move It Units is a DBA of{" "}
            {REGISTERED_ENTITY_NAME}.
          </p>
        </div>
      </div>
    </footer>
  );
}
