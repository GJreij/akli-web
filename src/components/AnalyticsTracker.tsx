"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trackPageView, setAnalyticsUserId } from "@/lib/analytics";

// Mounted once in the root layout. Fires a page_view on every route change —
// this is what lets the dashboard show the full path someone takes through
// the site without every page needing its own tracking code — and keeps the
// tracker aware of the current auth user so events get tagged correctly the
// moment a session exists, without every track() call needing its own lookup.
export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setAnalyticsUserId(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAnalyticsUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const full = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (lastPath.current === full) return;
    lastPath.current = full;
    trackPageView();
  }, [pathname, searchParams]);

  return null;
}
