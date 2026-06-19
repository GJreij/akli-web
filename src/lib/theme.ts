/**
 * AKLI THEME CONFIG
 * Change colors and fonts here — they propagate everywhere automatically.
 */

export const COLORS = {
  // Brand greens
  primary:   "#063330",   // deep forest — header, buttons, logo
  teal:      "#67b1b0",   // mid teal — accents, selected states
  tealDark:  "#437b7b",   // dark teal — hover states
  // Neutrals
  sand:      "#bfa280",   // warm sand — decorative accents
  cream:     "#dacab6",   // light cream — subtle backgrounds
  offWhite:  "#eee9e6",   // near-white — page background
  // Functional
  white:     "#ffffff",
  text:      "#1a1a1a",
  textMuted: "#5c5c5c",
  textLight: "#9a9a9a",
  border:    "#e0dbd5",
  error:     "#c0392b",
  errorBg:   "#fdf0ef",
};

export const FONTS = {
  // Option A (current): editorial + clean
  serif: "'Playfair Display', Georgia, serif",
  sans:  "'DM Sans', system-ui, sans-serif",

  // Option B: modern minimal — uncomment to test
  // serif: "'Lora', Georgia, serif",
  // sans:  "'Inter', system-ui, sans-serif",

  // Option C: Poppins (rounder, more playful)
  // serif: "'Playfair Display', Georgia, serif",
  // sans:  "'Poppins', system-ui, sans-serif",
};

/** Phone country codes — sorted: Lebanon first, then regional, then global */
export const COUNTRY_CODES = [
  { flag: "🇱🇧", name: "Lebanon",      code: "+961" },
  { flag: "🇦🇪", name: "UAE",          code: "+971" },
  { flag: "🇸🇦", name: "Saudi Arabia", code: "+966" },
  { flag: "🇰🇼", name: "Kuwait",       code: "+965" },
  { flag: "🇶🇦", name: "Qatar",        code: "+974" },
  { flag: "🇧🇭", name: "Bahrain",      code: "+973" },
  { flag: "🇴🇲", name: "Oman",         code: "+968" },
  { flag: "🇯🇴", name: "Jordan",       code: "+962" },
  { flag: "🇪🇬", name: "Egypt",        code: "+20"  },
  { flag: "🇫🇷", name: "France",       code: "+33"  },
  { flag: "🇬🇧", name: "UK",           code: "+44"  },
  { flag: "🇩🇪", name: "Germany",      code: "+49"  },
  { flag: "🇺🇸", name: "USA/Canada",   code: "+1"   },
  { flag: "🇦🇺", name: "Australia",    code: "+61"  },
];
