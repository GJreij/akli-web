import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — required for SSR auth, since server components can't
  // write cookies. getSession() only hits Supabase when the access token is
  // actually expiring (then refreshes it and setAll() above writes the new
  // cookies); getUser() made a network round trip on EVERY request,
  // prefetches included. This is NOT an auth check — every page/layout/
  // action still verifies the user with getUser() (see getAuthUser in
  // lib/supabase/server.ts), and RLS enforces access in the database.
  await supabase.auth.getSession();

  // Let reset-password through regardless — it handles its own auth client-side
  if (request.nextUrl.pathname === "/reset-password") {
    return supabaseResponse;
  }

  return supabaseResponse;
}

export const config = {
  // Static files never need a session refresh — skip images/fonts too, not
  // just the folders listed, so a page's assets don't each run this.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?)$).*)"],
};
