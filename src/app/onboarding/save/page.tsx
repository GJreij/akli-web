"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TENANT_ID = 1; // Leb DDB tenant

function SaveForm() {
  const router = useRouter();
  const params = useSearchParams();

  const kcal = Number(params.get("kcal") ?? 2000);
  const protein_g = Number(params.get("protein") ?? 0);
  const carbs_g = Number(params.get("carbs") ?? 0);
  const fat_g = Number(params.get("fat") ?? 0);
  const diet_type = params.get("diet_type") ?? "balanced";

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function formatPhone(raw: string): string {
    // Strip everything except digits and leading +
    return raw.replace(/[^\d+]/g, "");
  }

  function validate(): Record<string, string> {
    const e: Record<string, string> = {};
    if (!firstName.trim()) e.firstName = "Required";
    if (!lastName.trim()) e.lastName = "Required";

    const cleanPhone = formatPhone(phone);
    if (!phone.trim()) {
      e.phone = "Required";
    } else if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      e.phone = "Enter a valid WhatsApp number (e.g. +96170123456)";
    }

    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = "Enter a valid email";
    if (password.length < 8) e.password = "At least 8 characters";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    setServerError(null);

    const supabase = createClient();

    // 1. Create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setServerError(authError.message);
      setLoading(false);
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      setServerError("Sign-up failed — please try again.");
      setLoading(false);
      return;
    }

    // 2. Insert user profile
    const { error: profileError } = await supabase.from("user").insert({
      id: userId,
      name: firstName.trim(),
      last_name: lastName.trim(),
      phone_number: formatPhone(phone),
      email: email.trim(),
      tenant_id: TENANT_ID,
      onboarding: false,
      role: "client",
      status: "active",
    });

    if (profileError) {
      setServerError(`Profile error: ${profileError.message}`);
      setLoading(false);
      return;
    }

    // 3. Save macro targets
    const { error: macroError } = await supabase.from("daily_macro_target").insert({
      user_id: userId,
      tenant_id: TENANT_ID,
      kcal_target: kcal,
      protein_g,
      carbs_g,
      fat_g,
      diet_type,
    });

    if (macroError) {
      // Non-fatal — user is created, macros can be set later
      console.error("Macro target error:", macroError.message);
    }

    router.push("/home");
  }

  return (
    <div className="flex-1 flex flex-col pt-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-akli-charcoal">Save your plan</h1>
        <p className="text-akli-muted text-sm mt-1">
          Create your account to start ordering.
        </p>

        {/* Plan summary */}
        <div className="mt-4 bg-akli-green-pale rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-akli-charcoal text-sm font-medium">Your plan</span>
          <span className="text-akli-green font-bold">{kcal} kcal / day</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-4 flex-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
              First name
            </label>
            <input
              type="text"
              className="input-field"
              autoComplete="given-name"
              value={firstName}
              onChange={(e) => { setFirstName(e.target.value); setErrors((p) => ({ ...p, firstName: "" })); }}
            />
            {errors.firstName && <p className="text-red-600 text-xs mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
              Last name
            </label>
            <input
              type="text"
              className="input-field"
              autoComplete="family-name"
              value={lastName}
              onChange={(e) => { setLastName(e.target.value); setErrors((p) => ({ ...p, lastName: "" })); }}
            />
            {errors.lastName && <p className="text-red-600 text-xs mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
            WhatsApp number
          </label>
          <input
            type="tel"
            className="input-field"
            placeholder="+96170123456"
            autoComplete="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setErrors((p) => ({ ...p, phone: "" })); }}
          />
          {errors.phone && <p className="text-red-600 text-xs mt-1">{errors.phone}</p>}
          <p className="text-xs text-akli-muted mt-1">
            We reach out via WhatsApp — not email.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
            Email
          </label>
          <input
            type="email"
            className="input-field"
            autoComplete="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setErrors((p) => ({ ...p, email: "" })); }}
          />
          {errors.email && <p className="text-red-600 text-xs mt-1">{errors.email}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-akli-charcoal mb-1.5">
            Password
          </label>
          <input
            type="password"
            className="input-field"
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setErrors((p) => ({ ...p, password: "" })); }}
          />
          {errors.password && <p className="text-red-600 text-xs mt-1">{errors.password}</p>}
        </div>

        {serverError && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <button type="submit" className="btn-primary w-full" disabled={loading}>
          {loading ? "Creating account…" : "Create account & start"}
        </button>

        <p className="text-center text-xs text-akli-muted">
          Already have an account?{" "}
          <a href="/sign-in" className="text-akli-green underline">
            Sign in
          </a>
        </p>
      </form>
    </div>
  );
}

export default function SavePage() {
  return (
    <Suspense>
      <SaveForm />
    </Suspense>
  );
}
