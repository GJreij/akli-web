"use client";

import { useEffect, useRef, useState } from "react";
import { C, inputStyle, labelStyle } from "../ui";

interface Option {
  id: string;
  label: string;
}

export default function ClientMultiSelect({ options, defaultSelected }: { options: Option[]; defaultSelected: string[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultSelected));
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const selectedOptions = options.filter(o => selected.has(o.id));

  return (
    <div ref={rootRef} style={{ ...labelStyle, position: "relative", flex: "1 1 220px" }}>
      Clients
      {[...selected].map(id => <input key={id} type="hidden" name="client_id" value={id} />)}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          ...inputStyle, textAlign: "left", cursor: "pointer", minHeight: 32,
          display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center",
        }}
      >
        {selectedOptions.length === 0 ? (
          <span style={{ color: C.light }}>All clients ({options.length})</span>
        ) : (
          selectedOptions.map(o => (
            <span
              key={o.id}
              onClick={e => { e.stopPropagation(); toggle(o.id); }}
              title="Remove"
              style={{
                background: C.offWhite, color: C.primary, borderRadius: 12, padding: "2px 8px",
                fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4,
              }}
            >
              {o.label} <span style={{ color: C.light }}>×</span>
            </span>
          ))
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: C.white,
          border: `1px solid ${C.border}`, borderRadius: 8, maxHeight: 240, overflowY: "auto", zIndex: 20,
          boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderBottom: `1px solid ${C.offWhite}` }}>
            <button
              type="button"
              onClick={() => setSelected(new Set(options.map(o => o.id)))}
              style={{ background: "none", border: "none", color: C.tealDark, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              style={{ background: "none", border: "none", color: C.light, fontSize: 11, fontWeight: 600, cursor: "pointer", padding: 0 }}
            >
              Clear
            </button>
          </div>
          {options.map(o => (
            <label key={o.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", fontSize: 12.5, cursor: "pointer", color: C.primary }}>
              <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
              {o.label}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
