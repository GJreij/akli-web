export type MainRow = { id: number; is_main: boolean };

/**
 * A recipe with 2+ subrecipes must have at least one marked as main (the
 * solver uses "main" to anchor intra-meal serving balance). A single-
 * subrecipe recipe is trivially fine either way.
 */
export function validateMainAssignment(
  rows: MainRow[],
): { ok: true } | { ok: false; error: string } {
  if (rows.length >= 2 && !rows.some(r => r.is_main)) {
    return { ok: false, error: "This recipe needs at least one subrecipe marked as main." };
  }
  return { ok: true };
}
