import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import NativeShell from "@/components/NativeShell";
import LaunchSplash from "@/components/LaunchSplash";
import "./globals.css";

// Decides, before first paint, whether the opening animation plays on this page load.
// It plays only inside the iPhone/Android app, on every fresh launch (no referring page).
// A signed-in launch is redirected twice (/ -> /home -> /log-food) with full page loads, and
// each one would cut the animation off, so a "pending" marker carries the animation across
// those hops until it has played through once (LaunchSplash clears the marker when done).
// Never on the website, and never on admin/legal pages. The app is recognised by the bridge
// the native shell injects into its web view before the page runs.
const SPLASH_GATE = String.raw`
var d=document.documentElement,K="akli-splash-pending",skip=false;
try{var w=window,c=w.Capacitor;if(!((c&&c.isNativePlatform&&c.isNativePlatform())||(w.webkit&&w.webkit.messageHandlers&&w.webkit.messageHandlers.bridge)||w.androidBridge))skip=true}catch(e){}
try{if(/^\/(admin|driver|privacy|terms|support|delete-account|reset-password)/.test(location.pathname))skip=true}catch(e){}
if(!skip){try{var p=+localStorage.getItem(K)||0,resume=p>0&&Date.now()-p<12000;if(document.referrer&&!resume)skip=true;else localStorage.setItem(K,String(Date.now()))}catch(e){if(document.referrer)skip=true}}
if(skip)d.classList.add("splash-skip");
`;

export const metadata: Metadata = {
  title: "Akli — Your Personal Meal Plan",
  description: "Macro-optimised meal prep delivered fresh in Lebanon.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Akli" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#063330",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Opening animation gate: see SPLASH_GATE above. */}
        <script dangerouslySetInnerHTML={{ __html: SPLASH_GATE }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:ital,wght@0,300;0,400;0,500;0,600;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Suspense fallback={null}>
          <AnalyticsTracker />
        </Suspense>
        <NativeShell />
        <LaunchSplash />
        {children}
      </body>
    </html>
  );
}
