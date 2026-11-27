import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import AnalyticsTracker from "@/components/AnalyticsTracker";
import NativeShell from "@/components/NativeShell";
import LaunchSplash from "@/components/LaunchSplash";
import "./globals.css";

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
        {/* The opening animation is for the iPhone/Android app only, and plays on every fresh launch.
            Hidden before first paint: on the website; when the page was reached from another page
            (an in-app page change has a referrer, a fresh launch has none); and on admin/legal pages.
            The app is recognised by the bridge the native shell injects into its web view. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'var d=document.documentElement;try{var w=window,c=w.Capacitor;if(!((c&&c.isNativePlatform&&c.isNativePlatform())||(w.webkit&&w.webkit.messageHandlers&&w.webkit.messageHandlers.bridge)||w.androidBridge))d.classList.add("splash-skip")}catch(e){}try{if(document.referrer||/^\\/(admin|driver|privacy|terms|support|delete-account|reset-password)/.test(location.pathname))d.classList.add("splash-skip")}catch(e){}',
          }}
        />
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
