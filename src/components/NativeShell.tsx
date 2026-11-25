"use client";

import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { PushNotifications } from "@capacitor/push-notifications";
import { createClient } from "@/lib/supabase/client";

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
    if (process.env.NEXT_PUBLIC_PUSH_ENABLED === "true") startPushWhenSignedIn();
  }, []);

  return null;
}

// The phone's push address, kept until it can be saved against a signed-in
// customer (the token often arrives before the customer has logged in).
let deviceToken: string | null = null;
let savedFor: string | null = null; // user id the current token is saved under

async function saveToken(userId: string | null) {
  if (!deviceToken || savedFor === userId) return;
  const platform = Capacitor.getPlatform();
  if (platform !== "ios" && platform !== "android") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createClient() as any;
  if (userId) {
    const { error } = await db.rpc("register_device_token", { p_token: deviceToken, p_platform: platform });
    if (error) console.error("[push] could not save device token", error.message);
    else savedFor = userId;
  } else {
    // Signed out: stop notifications for the previous customer on this phone.
    await db.rpc("unregister_device_token", { p_token: deviceToken });
    savedFor = null;
  }
}

// Asking "Allow notifications?" on the very first screen, before the customer
// has signed in, gets more "Don't allow" answers (and a token we couldn't
// attach to anyone yet). So wait until someone is signed in.
async function startPushWhenSignedIn() {
  const supabase = createClient();
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    registerPush();
    return;
  }
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) return;
    sub.subscription.unsubscribe();
    registerPush();
  });
}

async function registerPush() {
  // Listeners first: register() can answer before the lines after it run.
  PushNotifications.addListener("registration", (token) => {
    deviceToken = token.value;
    savedFor = null;
    createClient().auth.getSession().then(({ data }) => saveToken(data.session?.user.id ?? null));
  });
  PushNotifications.addListener("registrationError", (err) => {
    console.error("[push] registration failed", err);
  });
  PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
    // A notification can carry a path like "/orders" to open when tapped.
    const path = action.notification.data?.path;
    if (typeof path === "string" && path.startsWith("/") && !path.startsWith("//")) {
      window.location.href = path;
    }
  });

  // Follow sign-in / sign-out so the token always belongs to whoever is logged in.
  createClient().auth.onAuthStateChange((event, session) => {
    if (session?.user) saveToken(session.user.id);
    else if (event === "SIGNED_OUT") saveToken(null);
  });

  const perm = await PushNotifications.checkPermissions();
  let granted = perm.receive === "granted";

  if (!granted && perm.receive !== "denied") {
    const req = await PushNotifications.requestPermissions();
    granted = req.receive === "granted";
  }
  if (!granted) return;

  await PushNotifications.register();
}
