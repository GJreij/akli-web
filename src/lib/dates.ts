// Orders must be placed (and cancellations requested) 48h ahead of the
// delivery day. Computed against Beirut local time, not server UTC — using
// toISOString() here would shift the cutoff by a day overnight for a UTC+3
// server/client mismatch. Mirrors `beirut_iso_date` in
// BackEnd/mealplanner-flask/utils/dates.py — both enforce the same 48h rule
// and a divergence would let one side accept a date the other rejects.
export function beirutISODate(daysFromNow: number): string {
  const beirutNow = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Beirut" })
  );
  beirutNow.setDate(beirutNow.getDate() + daysFromNow);
  return `${beirutNow.getFullYear()}-${String(beirutNow.getMonth() + 1).padStart(2, "0")}-${String(beirutNow.getDate()).padStart(2, "0")}`;
}
