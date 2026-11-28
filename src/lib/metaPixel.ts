"use client";

// ─── Meta (Facebook) pixel ─────────────────────────────────────────────────
//
// Loaded by <MetaPixel /> in the root layout; this file is the only place the
// rest of the app talks to it. Every call is a no-op when
// NEXT_PUBLIC_META_PIXEL_ID isn't set, when the pixel script hasn't loaded
// (blocked by an ad blocker, excluded route, native app) or on the server —
// nothing here may ever throw into a signup or checkout flow.
//
// The dataset's category in Meta is "None": never pass health or body data
// (weight, goal, kcal, macros, allergies, diet type) or contact details
// (email, phone) in params. Only money, counts and ids.
//
// Separate from src/lib/analytics.ts (our own analytics_event table) on
// purpose — that one stays the source of truth; this only feeds Meta ads.

export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window { fbq?: Fbq }
}

// Routes where the pixel never loads or fires: staff-only screens, and auth
// pages whose URL carries a one-time code / token (the pixel reports the full
// page URL to Meta with every event).
const EXCLUDED_PREFIXES = ["/admin", "/driver", "/reset-password", "/auth"];

export function isPixelExcludedPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return EXCLUDED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

export function newEventId(prefix: string): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${rand}`;
}

type PixelParams = Record<string, string | number | boolean | null | undefined>;

// Fires a standard Meta event. Pass eventId for conversion events so the
// Conversions API can later send the same event server-side without Meta
// counting it twice. Returns the event id actually sent (or null if the pixel
// isn't available).
export function track(event: string, params: PixelParams = {}, eventId?: string): string | null {
  if (typeof window === "undefined" || !META_PIXEL_ID) return null;
  // The script stays loaded after a client-side move into /admin, and admin's
  // manual-order screen reuses OrderFlow — staff actions must never count.
  if (isPixelExcludedPath(window.location.pathname)) return null;
  const fbq = window.fbq;
  if (typeof fbq !== "function") return null;
  const id = eventId ?? newEventId(event.toLowerCase());
  try {
    fbq("track", event, params, { eventID: id });
  } catch {
    return null;
  }
  return id;
}

export function trackPageView(): void {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;
  if (isPixelExcludedPath(window.location.pathname)) return;
  try { window.fbq?.("track", "PageView"); } catch { /* never break the page */ }
}

// Purchase must count once per order even if the success path somehow runs
// twice (double submit, a retry that recovers an already-placed order). The
// key is remembered in localStorage so a later reload can't resend it either.
const PURCHASE_SENT_KEY = "akli_fb_purchases";

export function trackPurchaseOnce(orderKey: string, params: { value: number; currency: string; num_items: number }, eventId?: string): void {
  if (typeof window === "undefined" || !META_PIXEL_ID) return;
  let sent: string[] = [];
  try { sent = JSON.parse(localStorage.getItem(PURCHASE_SENT_KEY) ?? "[]"); } catch { sent = []; }
  if (!Array.isArray(sent)) sent = [];
  if (sent.includes(orderKey)) return;
  if (!track("Purchase", params, eventId)) return; // pixel not ready — don't mark as sent
  try {
    localStorage.setItem(PURCHASE_SENT_KEY, JSON.stringify([...sent, orderKey].slice(-50)));
  } catch { /* storage full / disabled — the in-flow guard still applies */ }
}
