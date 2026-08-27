// Same 14-item EU allergen set as `ingredient`'s boolean columns (see
// src/app/admin/catalog/ingredients/[id]/page.tsx), mirrored onto `user` for
// the customer's own preferences, and rolled up per subrecipe/recipe via the
// `subrecipe_allergen` / `recipe_allergen` Postgres views (union across a
// recipe's subrecipes' ingredients — the single source of truth for "does
// this dish contain X", queried the same way from every surface: My Tastes,
// the menu browser, order review, the kitchen portioning panel, and the
// admin order-notification email).
export type AllergenKey =
  | "celery"
  | "cereals_containing_gluten"
  | "crustaceans"
  | "eggs"
  | "fish"
  | "lupin"
  | "milk"
  | "molluscs"
  | "sulphites"
  | "mustard"
  | "peanuts"
  | "sesame"
  | "soybeans"
  | "tree_nuts";

export const ALLERGENS: { key: AllergenKey; label: string }[] = [
  { key: "celery", label: "Celery" },
  { key: "cereals_containing_gluten", label: "Gluten" },
  { key: "crustaceans", label: "Crustaceans" },
  { key: "eggs", label: "Eggs" },
  { key: "fish", label: "Fish" },
  { key: "lupin", label: "Lupin" },
  { key: "milk", label: "Milk" },
  { key: "molluscs", label: "Molluscs" },
  { key: "sulphites", label: "Sulphites" },
  { key: "mustard", label: "Mustard" },
  { key: "peanuts", label: "Peanuts" },
  { key: "sesame", label: "Sesame" },
  { key: "soybeans", label: "Soybeans" },
  { key: "tree_nuts", label: "Tree nuts" },
];

export type AllergenFlags = Record<AllergenKey, boolean | null>;

export function emptyAllergenFlags(): Record<AllergenKey, boolean> {
  return Object.fromEntries(ALLERGENS.map(a => [a.key, false])) as Record<AllergenKey, boolean>;
}

// Which of the user's declared allergens are actually present in this dish —
// alert-only, never used to filter/exclude what gets generated or shown.
export function conflictingAllergens(
  userFlags: AllergenFlags | null | undefined,
  dishFlags: AllergenFlags | null | undefined
): { key: AllergenKey; label: string }[] {
  if (!userFlags || !dishFlags) return [];
  return ALLERGENS.filter(a => userFlags[a.key] && dishFlags[a.key]);
}
