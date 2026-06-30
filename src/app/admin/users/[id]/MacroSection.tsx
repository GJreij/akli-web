"use client";

import { useState } from "react";
import AdminMacroEditor from "@/components/AdminMacroEditor";

type MacroRow = {
  id: number;
  created_at: string;
  kcal_target: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  diet_type: string | null;
  goal: string | null;
  source: string | null;
  method: string | null;
};

export default function MacroSection({ userId, initialHistory }: {
  userId: string;
  initialHistory: MacroRow[];
}) {
  const [history, setHistory] = useState<MacroRow[]>(initialHistory);

  function handleSaved(row: MacroRow) {
    setHistory(prev => [row, ...prev]);
  }

  return (
    <AdminMacroEditor userId={userId} history={history} onSaved={handleSaved} />
  );
}
