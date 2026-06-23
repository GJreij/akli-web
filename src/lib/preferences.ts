import { createClient } from "@/lib/supabase/client";

export type PrefRating = "like" | "dislike" | "skip" | null;

export interface RecipePref {
  recipe_id: number;
  rating: PrefRating;
}

export async function upsertRecipePref(
  userId: string,
  recipeId: number,
  rating: PrefRating
): Promise<void> {
  const supabase = createClient();

  // Note: this only ever touches like/dislike/dont_include — never deletes
  // the row outright, so a comment saved on the same recipe (see
  // upsertRecipeComment) survives clearing the rating.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("user_recipe_preferences") as any)
    .upsert(
      {
        user_id:      userId,
        recipe_id:    recipeId,
        like:         rating === "like",
        dislike:      rating === "dislike",
        dont_include: rating === "skip",
        updated_at:   new Date().toISOString(),
      },
      { onConflict: "user_id,recipe_id" }
    );
}

// Standing per-recipe note for the kitchen (e.g. "no onions please").
// Kept separate from the rating so clearing one never wipes the other.
export async function upsertRecipeComment(
  userId: string,
  recipeId: number,
  comment: string
): Promise<void> {
  const supabase = createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase.from("user_recipe_preferences") as any)
    .upsert(
      {
        user_id:    userId,
        recipe_id:  recipeId,
        comment:    comment.trim() || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,recipe_id" }
    );
}

export function parsePref(row: { like: boolean | null; dislike: boolean | null; dont_include: boolean | null }): PrefRating {
  if (row.dont_include) return "skip";
  if (row.dislike)      return "dislike";
  if (row.like)         return "like";
  return null;
}
