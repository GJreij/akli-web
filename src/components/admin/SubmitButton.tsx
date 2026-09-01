"use client";

import { useFormStatus } from "react-dom";

/**
 * Drop-in replacement for a plain `<button type="submit">` inside a
 * `<form action={serverAction}>`. Server actions round-trip through
 * requireAdmin() plus however many Supabase calls the action makes, so a
 * click can take a real fraction of a second — without this, admin forms
 * gave zero feedback during that wait, which read as the button being stuck.
 */
export default function SubmitButton({
  children,
  pendingText,
  style,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        ...style,
        opacity: pending ? 0.6 : (style?.opacity ?? 1),
        cursor: pending ? "wait" : (style?.cursor ?? "pointer"),
      }}
      {...rest}
    >
      {pending ? (pendingText ?? "…") : children}
    </button>
  );
}
