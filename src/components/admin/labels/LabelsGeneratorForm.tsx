"use client";

import { useState } from "react";
import { Section, inputStyle, labelStyle, primaryButton, subtleButton, C } from "@/components/admin/ui";
import type { ClientOption } from "@/lib/labels";
import type { PaperSize, Orientation } from "@/components/admin/labels/LabelPdfDocument";

export default function LabelsGeneratorForm({
  start,
  end,
  clients,
}: {
  start: string;
  end: string;
  clients: ClientOption[];
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(clients.map((c) => c.user_id)));
  const [paperSize, setPaperSize] = useState<PaperSize>("A4");
  const [orientation, setOrientation] = useState<Orientation>("portrait");
  const [marginMm, setMarginMm] = useState(10);
  const [labelWidthMm, setLabelWidthMm] = useState(70);
  const [labelHeightMm, setLabelHeightMm] = useState(50);
  const [stroke, setStroke] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleClient(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/labels/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start,
          end,
          userIds: selectedIds.size < clients.length ? Array.from(selectedIds) : undefined,
          options: { paperSize, orientation, marginMm, labelWidthMm, labelHeightMm, stroke },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate PDF");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <>
      <Section
        title="Clients"
        right={
          <button
            type="button"
            style={subtleButton}
            onClick={() =>
              setSelectedIds(selectedIds.size === clients.length ? new Set() : new Set(clients.map((c) => c.user_id)))
            }
          >
            {selectedIds.size === clients.length ? "Deselect all" : "Select all"}
          </button>
        }
      >
        {clients.length === 0 ? (
          <p style={{ fontSize: 13, color: C.muted, margin: 0 }}>No clients have orders in this date range.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 260, overflowY: "auto" }}>
            {clients.map((c) => (
              <label key={c.user_id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.primary }}>
                <input type="checkbox" checked={selectedIds.has(c.user_id)} onChange={() => toggleClient(c.user_id)} />
                {c.name} {c.last_name}
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section title="Print options">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <label style={{ ...labelStyle, flex: "0 1 140px" }}>
            Paper size
            <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as PaperSize)} style={inputStyle}>
              <option value="A3">A3</option>
              <option value="A4">A4</option>
              <option value="A5">A5</option>
              <option value="LETTER">Letter</option>
            </select>
          </label>
          <label style={{ ...labelStyle, flex: "0 1 140px" }}>
            Orientation
            <select value={orientation} onChange={(e) => setOrientation(e.target.value as Orientation)} style={inputStyle}>
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <label style={{ ...labelStyle, flex: "0 1 110px" }}>
            Margin (mm)
            <input type="number" min={0} value={marginMm} onChange={(e) => setMarginMm(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, flex: "0 1 130px" }}>
            Label width (mm)
            <input type="number" min={1} value={labelWidthMm} onChange={(e) => setLabelWidthMm(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, flex: "0 1 130px" }}>
            Label height (mm)
            <input type="number" min={1} value={labelHeightMm} onChange={(e) => setLabelHeightMm(Number(e.target.value))} style={inputStyle} />
          </label>
          <label style={{ ...labelStyle, flex: "0 1 120px", flexDirection: "row", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={stroke} onChange={(e) => setStroke(e.target.checked)} />
            Cut-line stroke
          </label>
        </div>

        {error && <p style={{ color: C.error, fontSize: 12.5, marginTop: 10 }}>{error}</p>}

        <button
          type="button"
          onClick={handleGenerate}
          disabled={generating || clients.length === 0 || selectedIds.size === 0}
          style={{ ...primaryButton, marginTop: 14, opacity: generating || selectedIds.size === 0 ? 0.6 : 1 }}
        >
          {generating ? "Generating…" : "Generate PDF"}
        </button>
      </Section>
    </>
  );
}
