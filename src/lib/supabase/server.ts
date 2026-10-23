import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component — mutations ignored
          }
        },
      },
    }
  );
}

// Each getUser() is a network round trip to Supabase Auth. A layout and the
// page under it render in the same request, so wrap the check in React's
// per-request cache: the second caller reuses the first result instead of
// asking Supabase again. (Outside a render, e.g. in a server action, cache()
// is a no-op and this just calls getUser().)
export const getAuthUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export const getUserRole = cache(async (userId: string) => {
  const supabase = await createClient();
  const { data } = await supabase.from("user").select("role").eq("id", userId).single();
  return (data as { role: string | null } | null)?.role ?? null;
});
