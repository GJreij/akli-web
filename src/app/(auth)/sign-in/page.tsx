"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";

export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    let isAdmin = false;
    if (user) {
      const { data: profile } = await supabase.from("user").select("*").eq("id", user.id).single();
      isAdmin = (profile as Database["public"]["Tables"]["user"]["Row"] | null)?.role === "admin";
    }

    router.push(isAdmin ? "/admin" : "/home");
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-akli-cream flex flex-col">
      <nav className="px-6 py-4">
        <Link href="/" className="text-2xl font-bold text-akli-green">akli</Link>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold text-akli-charcoal mb-1">Welcome back</h1>
          <p className="text-akli-muted mb-8 text-sm">Sign in to your Akli account.</p>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="input-field"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
              />
            </div>

            {error && (
              <p className="text-red-600 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
            )}

            <button type="submit" className="btn-primary w-full" disabled={loading}>
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="text-center text-sm text-akli-muted mt-6">
            Don&apos;t have an account?{" "}
            <Link href="/" className="text-akli-green font-medium underline">
              Get started
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
