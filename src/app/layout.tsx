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
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Akli" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#063330",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Hide the opening animation before first paint when it was already shown this session, or on admin/legal pages. */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              'try{if(sessionStorage.getItem("akli-splash-seen")||/^\\/(admin|driver|privacy|terms|support|delete-account|reset-password)/.test(location.pathname))document.documentElement.classList.add("splash-skip")}catch(e){}',
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
