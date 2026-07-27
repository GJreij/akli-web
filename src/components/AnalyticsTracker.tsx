"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { trackPageView, setAnalyticsUserId, setAnalyticsAdminFlag } from "@/lib/analytics";

// Mounted once in the root layout. Fires a page_view on every route change —
// this is what lets the dashboard show the full path someone takes through
// the site without every page needing its own tracking code — and keeps the
// tracker aware of the current auth user so events get tagged correctly the
// moment a session exists, without every track() call needing its own lookup.
export default function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastPath = useRef<string | null>(null);
  // Gates page_view on the admin-role check having resolved at least once —
  // without this, the very first page_view of every fresh load fires from a
  // separate effect that doesn't wait on the async role lookup below, so an
  // admin's own session leaked into analytics_event on every hard reload
  // despite isAdminUser existing specifically to filter that out.
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function syncUser(userId: string | null) {
      setAnalyticsUserId(userId);
      if (!userId) { setAnalyticsAdminFlag(false); setAuthReady(true); return; }
      const { data } = await supabase.from("user").select("role").eq("id", userId).single();
      setAnalyticsAdminFlag((data as { role: string | null } | null)?.role === "admin");
      setAuthReady(true);
    }

    supabase.auth.getUser().then(({ data }) => syncUser(data.user?.id ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthReady(false);
      syncUser(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authReady) return;
    const query = searchParams.toString();
    const full = query ? `${pathname}?${query}` : pathname;
    if (lastPath.current === full) return;
    lastPath.current = full;
    // track()'s `page` column is window.location.pathname only, so the query
    // string (?start=onboarding, ?lid=, ?utm_*) would otherwise be silently
    // dropped from this event — keep it in metadata instead.
    trackPageView(query ? { query } : {});
  }, [pathname, searchParams, authReady]);

  return null;
}
