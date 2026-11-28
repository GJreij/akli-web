"use client";

import { useEffect, useRef, useState } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { META_PIXEL_ID, isPixelExcludedPath, trackPageView } from "@/lib/metaPixel";

// Mounted once in the root layout (inside a Suspense, for useSearchParams).
//
// - Does nothing at all when NEXT_PUBLIC_META_PIXEL_ID is unset.
// - Never loads on excluded routes (/admin, /driver, auth pages). If someone
//   lands on one first, the script loads the first time they reach a normal
//   page instead; once loaded, excluded routes just don't fire PageView.
// - Skipped inside the Capacitor iOS/Android shell (which loads this same
//   site): tracking there would need Apple's ATT prompt and updated store
//   privacy labels. Web only for now.
// - The base code fires the first PageView; this component fires one on
//   every client-side route change after that. Meta's own history-API
//   auto-tracking is turned off (disablePushState) so those aren't doubled,
//   and automatic events (autoConfig) are off so the pixel doesn't scrape
//   button text / page metadata — those include kcal and macro numbers.
export default function MetaPixel() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const excluded = isPixelExcludedPath(pathname);
  const [enabled, setEnabled] = useState(false);
  const lastTracked = useRef<string | null>(null);

  const query = searchParams.toString();
  const fullPath = query ? `${pathname}?${query}` : pathname;

  useEffect(() => {
    if (enabled || !META_PIXEL_ID || excluded) return;
    if (Capacitor.isNativePlatform()) return;
    // The base code's own PageView covers this first path.
    lastTracked.current = fullPath;
    setEnabled(true);
  }, [enabled, excluded, fullPath]);

  useEffect(() => {
    if (!enabled || excluded) return;
    if (lastTracked.current === fullPath) return;
    lastTracked.current = fullPath;
    trackPageView();
  }, [enabled, excluded, fullPath]);

  if (!META_PIXEL_ID) return null;

  return (
    <>
      {enabled && (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
document,'script','https://connect.facebook.net/en_US/fbevents.js');
fbq.disablePushState=true;
fbq('set','autoConfig',false,${JSON.stringify(META_PIXEL_ID)});
fbq('init',${JSON.stringify(META_PIXEL_ID)});
fbq('track','PageView');`}
        </Script>
      )}
      {!excluded && (
        <noscript>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            height="1"
            width="1"
            style={{ display: "none" }}
            alt=""
            src={`https://www.facebook.com/tr?id=${encodeURIComponent(META_PIXEL_ID)}&ev=PageView&noscript=1`}
          />
        </noscript>
      )}
    </>
  );
}
