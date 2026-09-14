import type { Config } from "tailwindcss";

// Design tokens — "Campfire Calendar" palette: warm cream paper, deep
// forest for structure, terracotta as the one loud accent. Every existing
// component already uses these token NAMES (bg-pine, text-paper, bg-ember,
// etc.) from the earlier dark theme — only the hex values changed here, so
// switching themes didn't require touching component markup. That does
// mean a couple of names are now a little metaphorical (`ink` is a warm
// charcoal text color, not literally ink-black-as-background anymore) —
// worth knowing if you rename things later.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F3ECDA", // page background
        ink: "#FBF3E4", // text ON the ember accent (buttons, active toggles) — must
        // stay light since ember is a mid-toned terracotta, unlike the old
        // theme's pale amber that dark text used to sit on
        pine: "#FBF8F0", // input/card surfaces (slightly lighter than page bg)
        slate: "#DED2B4", // borders and subtle fills
        ember: "#C1502E", // primary accent — buttons, active nav, numbered steps
        moonlight: "#3F5A47", // secondary accent — forest green, links, "free" counts
        paper: "#241F16", // body/heading text
        sage: "#8A7C63", // muted secondary text
        rust: "#8B3A22", // errors, conflicts, destructive actions
        forest: "#2F4536", // header/nav background, deep structural surfaces
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
