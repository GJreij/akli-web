"use client";

import { useEffect } from "react";

// Admins leave this tab open and backgrounded for hours, then come back and
// tap a button that just... does nothing. Root cause: this is a PWA
// (next-pwa, skipWaiting: true) — every deploy ships a new service worker,
// but a tab that's just sitting in the background never checks for it, so it
// keeps running the OLD page bundle. That old bundle's server actions
// (savePortioning, decideCancellation, etc.) were compiled with action IDs
// the server no longer recognizes once a new version has shipped, so the
// button's onClick fires but the request silently fails server-side.
//
// Fix: when the tab regains visibility after being hidden a while, ask the
// service worker to check for an update. If one lands, the browser fires
// "controllerchange" — reload once so the tab is back on a bundle whose
// server actions actually match what's deployed.
const STALE_AFTER_MS = 15 * 60 * 1000; // 15 minutes backgrounded

export default function StaleAppGuard() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let hiddenAt: number | null = null;
    let reloading = false;

    const reloadOnce = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnce);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (document.visibilityState !== "visible" || hiddenAt == null) return;
      const hiddenFor = Date.now() - hiddenAt;
      hiddenAt = null;
      if (hiddenFor < STALE_AFTER_MS) return;
      navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => {});
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadOnce);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
