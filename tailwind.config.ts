import type { Config } from "tailwindcss";

// Design tokens — a dusk-camp palette instead of the generic
// cream-background/terracotta-accent combo. Ink and pine for the ground,
// ember for the one warm accent, moonlight teal as the cool counterpoint
// used only for "this day is clear."
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14201C",
        pine: "#1C2B25",
        slate: "#24352D",
        ember: "#E2984B",
        moonlight: "#9FD6D2",
        paper: "#EDE6D6",
        sage: "#8FA79B",
        rust: "#B4553A",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "serif"],
        sans: ["var(--font-public-sans)", "sans-serif"],
        mono: ["var(--font-ibm-plex-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
