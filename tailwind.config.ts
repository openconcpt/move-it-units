import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: "var(--paper)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        structural: {
          DEFAULT: "var(--structural)",
          // Neutral band a shade darker than the page — the footer.
          soft: "var(--structural-soft)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          ink: "var(--accent-ink)",
          soft: "var(--accent-soft)",
        },
        danger: "var(--danger)",
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui", "sans-serif"],
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      maxWidth: {
        // Shared width tokens — every section on the landing page uses one
        // of these two, never an ad-hoc max-w-*. `container` is the page's
        // outer measure; `prose` nests inside it for long-line-length text.
        container: "1120px",
        prose: "720px",
        // Still used by /book and the booking confirmation page.
        content: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
