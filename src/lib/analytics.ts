"use client";

import { createClient } from "@/lib/supabase/client";

// ─── Identity ───────────────────────────────────────────────────────────────
//
// Visitors don't have an account (or even a session) for most of their first
// visit, so we can't rely on Supabase auth to tell us who's who. Instead we
// mint a random id on first load and keep it in localStorage — this is what
// lets us track someone all the way from their first page view through
// onboarding, and only attach a real user_id once they actually sign up.

const ANON_ID_KEY = "akli_anon_id";
const SESSION_ID_KEY = "akli_session_id";
const SESSION_TS_KEY = "akli_session_ts";
const UTM_KEY = "akli_utm";
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 min of inactivity = new session

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function getAnonId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(ANON_ID_KEY);
  if (!id) {
    id = uuid();
    localStorage.setItem(ANON_ID_KEY, id);
  }
  return id;
}

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  const now = Date.now();
  const lastTs = Number(sessionStorage.getItem(SESSION_TS_KEY) ?? 0);
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id || now - lastTs > SESSION_TIMEOUT_MS) {
    id = uuid();
    sessionStorage.setItem(SESSION_ID_KEY, id);
  }
  sessionStorage.setItem(SESSION_TS_KEY, String(now));
  return id;
}

// Capture UTM params (and a "first touch" referrer) the first time we see them,
// and keep reusing them for the rest of the visit even once the user has
// clicked through to a page without those params in the URL.
function getUtm(): { source: string | null; medium: string | null; campaign: string | null } {
  if (typeof window === "undefined") return { source: null, medium: null, campaign: null };
  const params = new URLSearchParams(window.location.search);
  const fromUrl = {
    source: params.get("utm_source"),
    medium: params.get("utm_medium"),
    campaign: params.get("utm_campaign"),
  };
  if (fromUrl.source || fromUrl.medium || fromUrl.campaign) {
    localStorage.setItem(UTM_KEY, JSON.stringify(fromUrl));
    return fromUrl;
  }
  try {
    const stored = localStorage.getItem(UTM_KEY);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore malformed cache */ }
  return { source: null, medium: null, campaign: null };
}

function getDeviceInfo(): { device_type: string; browser: string; os: string } {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const device_type = /Mobi|Android/i.test(ua) ? (/iPad|Tablet/i.test(ua) ? "tablet" : "mobile") : "desktop";
  const browser =
    /Edg\//.test(ua) ? "Edge" :
    /Chrome\//.test(ua) ? "Chrome" :
    /Safari\//.test(ua) && !/Chrome/.test(ua) ? "Safari" :
    /Firefox\//.test(ua) ? "Firefox" : "Other";
  const os =
    /iPhone|iPad|iPod/.test(ua) ? "iOS" :
    /Android/.test(ua) ? "Android" :
    /Mac OS X/.test(ua) ? "macOS" :
    /Windows/.test(ua) ? "Windows" : "Other";
  return { device_type, browser, os };
}

// ─── Event queue ────────────────────────────────────────────────────────────

type EventRow = {
  anon_id: string;
  session_id: string;
  user_id: string | null;
  event_name: string;
  event_category: string;
  page: string;
  referrer: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device_type: string;
  browser: string;
  os: string;
  metadata: Record<string, unknown>;
  created_at: string;
};

let queue: EventRow[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let cachedUserId: string | null = null;

const FLUSH_INTERVAL_MS = 4000;
const FLUSH_BATCH_SIZE = 20;

// Components that know the current auth user can tell the tracker once,
// instead of every track() call having to await a Supabase session lookup.
export function setAnalyticsUserId(userId: string | null) {
  cachedUserId = userId;
}

async function flush(useBeacon = false) {
  if (queue.length === 0) return;
  const batch = queue;
  queue = [];

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/analytics_event`;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(batch),
      // keepalive lets this request survive the page actually unloading —
      // the standard way to flush analytics on tab close/navigation away.
      keepalive: useBeacon,
    });
  } catch {
    // best-effort — dropped events aren't worth retrying and risking duplicates
  }
}

function scheduleFlush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flush();
  }, FLUSH_INTERVAL_MS);
}

export function track(eventName: string, metadata: Record<string, unknown> = {}, category = "general") {
  if (typeof window === "undefined") return;
  const utm = getUtm();
  const device = getDeviceInfo();
  queue.push({
    anon_id: getAnonId(),
    session_id: getSessionId(),
    user_id: cachedUserId,
    event_name: eventName,
    event_category: category,
    page: window.location.pathname,
    referrer: document.referrer || "",
    utm_source: utm.source,
    utm_medium: utm.medium,
    utm_campaign: utm.campaign,
    device_type: device.device_type,
    browser: device.browser,
    os: device.os,
    metadata,
    created_at: new Date().toISOString(),
  });
  if (queue.length >= FLUSH_BATCH_SIZE) flush();
  else scheduleFlush();
}

export function trackPageView(metadata: Record<string, unknown> = {}) {
  track("page_view", metadata, "navigation");
}

// Flush whatever's queued the moment the tab is hidden or closed — otherwise
// the last few events of a session are silently lost.
if (typeof window !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush(true);
  });
  window.addEventListener("pagehide", () => flush(true));
}

// ─── Anon → user merge ──────────────────────────────────────────────────────
//
// Call this right after sign-up/sign-in succeeds. It re-tags every earlier
// anonymous event from this device with the now-known user_id, so the full
// journey — landing page through to becoming a customer — joins up into one
// person instead of staying two disconnected anonymous/identified halves.

export async function linkAnonToUser(userId: string) {
  setAnalyticsUserId(userId);
  const anonId = getAnonId();
  if (!anonId) return;
  try {
    const supabase = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("analytics_event") as any)
      .update({ user_id: userId })
      .eq("anon_id", anonId)
      .is("user_id", null);
  } catch {
    // non-critical — losing the historical link still leaves future events tagged correctly
  }
}
