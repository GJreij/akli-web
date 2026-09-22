"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import SubmitButton from "@/components/admin/SubmitButton";
import { dangerButton, subtleButton, C } from "@/components/admin/ui";

export default function RecipePhotoField({
  photoUrl,
  uploadAction,
  deleteAction,
}: {
  photoUrl: string | null;
  uploadAction: (formData: FormData) => Promise<void>;
  deleteAction: () => Promise<void>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(URL.createObjectURL(file));

    const formData = new FormData();
    formData.append("photo_file", file);
    startTransition(async () => {
      try {
        await uploadAction(formData);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
        setPreview(null);
      } finally {
        if (inputRef.current) inputRef.current.value = "";
      }
    });
  }

  const displaySrc = preview ?? photoUrl;

  return (
    <div>
      <div
        style={{
          width: 220,
          height: 220,
          borderRadius: 12,
          overflow: "hidden",
          background: C.offWhite,
          border: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 10,
        }}
      >
        {displaySrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displaySrc}
            alt="Recipe photo"
            style={{ width: "100%", height: "100%", objectFit: "cover", opacity: isPending ? 0.5 : 1 }}
          />
        ) : (
          <span style={{ fontSize: 12.5, color: C.light }}>No photo</span>
        )}
      </div>

      {error && <p style={{ fontSize: 11.5, color: "#b91c1c", margin: "0 0 8px" }}>{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={isPending}
          style={{ ...subtleButton, opacity: isPending ? 0.6 : 1, cursor: isPending ? "wait" : "pointer" }}
        >
          {isPending ? "Uploading…" : photoUrl ? "Replace photo" : "Upload photo"}
        </button>
        {photoUrl && (
          <form action={deleteAction}>
            <SubmitButton style={{ ...dangerButton, padding: "8px 14px" }} pendingText="Removing…">
              Delete photo
            </SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
