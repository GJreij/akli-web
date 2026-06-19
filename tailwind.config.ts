import type { Config } from "tailwindcss";

// Colors imported from theme.ts — Tailwind needs them statically, so they're duplicated here.
// When you change a color, update BOTH theme.ts and this file.
const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        akli: {
          primary:    "#063330",
          teal:       "#67b1b0",
          "teal-dark":"#437b7b",
          sand:       "#bfa280",
          cream:      "#dacab6",
          "off-white":"#eee9e6",
          white:      "#ffffff",
          text:       "#1a1a1a",
          muted:      "#5c5c5c",
          light:      "#9a9a9a",
          border:     "#e0dbd5",
        },
      },
      fontFamily: {
        serif: ["'Playfair Display'", "Georgia", "serif"],
        sans:  ["'DM Sans'", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
