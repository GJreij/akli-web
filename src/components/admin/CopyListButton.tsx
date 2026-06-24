"use client";

import { useState } from "react";
import { C } from "./ui";

export default function CopyListButton({ text, label = "Copy list" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        background: copied ? C.tealDark : C.primary, color: C.white, border: "none", borderRadius: 8,
        padding: "7px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
