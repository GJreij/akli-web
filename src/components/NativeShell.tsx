"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { PushNotifications } from "@capacitor/push-notifications";

// Mounted once in the root layout, alongside AnalyticsTracker. No-ops
// entirely on web — every call in here is gated on isNativePlatform() so
// this file has zero effect on the site itself, only on the Capacitor-wrapped
// iOS/Android build.
export default function NativeShell() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Hook for the app-only CSS in globals.css (no bounce, no long-press menus).
    document.documentElement.classList.add("is-native");

    // next-pwa's service worker and the native shell are two competing
    // offline-caching layers — running both is the classic cause of "the app
    // won't show my update" bugs, so the wrapped app runs with neither: the
    // native shell has no offline cache of its own either (server.url in
    // capacitor.config.ts loads the real site fresh, same as any browser).
    navigator.serviceWorker?.getRegistrations().then((regs) => {
      regs.forEach((r) => r.unregister());
    });

    // Style.Default lets the phone pick readable text for the bar. (Style.Dark
    // means LIGHT text, for dark bars: on our cream bar it was invisible.)
    StatusBar.setStyle({ style: Style.Default }).catch(() => {});
    if (Capacitor.getPlatform() === "android") {
      // Android 14 and older draw the page under the status bar by default,
      // hiding the top of every screen. (Android 15+ pads for it by itself.)
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
      StatusBar.setBackgroundColor({ color: "#F8F4EF" }).catch(() => {});
    }
    SplashScreen.hide().catch(() => {});

    // Off until Firebase (google-services.json) and the Apple push key are set
    // up in the native builds: on Android, register() without Firebase crashes
    // the whole app natively the moment the customer taps Allow, and that
    // crash can't be caught from JS. Set NEXT_PUBLIC_PUSH_ENABLED=true only
    // once a release with push configured is what customers have installed.
    if (process.env.NEXT_PUBLIC_PUSH_ENABLED === "true") registerPush();
  }, []);

  return null;
}

async function registerPush() {
  const perm = await PushNotifications.checkPermissions();
  let granted = perm.receive === "granted";

  if (!granted && perm.receive !== "denied") {
    const req = await PushNotifications.requestPermissions();
    granted = req.receive === "granted";
  }
  if (!granted) return;

  await PushNotifications.register();

  // TODO: once Firebase (Android) and an APNs key (iOS) exist, POST this
  // token + the signed-in user_id to a new endpoint that upserts it into a
  // device-token table (with RLS scoping it to its own owner) so an order
  // status change or delivery reminder can actually be sent. Until then this
  // fires but has nowhere to deliver the token.
  PushNotifications.addListener("registration", (token) => {
    console.log("[push] device token", token.value);
  });
  PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] registration failed", err);
  });
  PushNotifications.addListener("pushNotificationReceived", (notification) => {
    console.log("[push] received in foreground", notification);
  });
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    console.log("[push] tapped", action.notification);
  });
}
