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

  if (rating === null) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from("user_recipe_preferences") as any)
      .delete()
      .eq("user_id", userId)
      .eq("recipe_id", recipeId);
    return;
  }

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

export function parsePref(row: { like: boolean | null; dislike: boolean | null; dont_include: boolean | null }): PrefRating {
  if (row.dont_include) return "skip";
  if (row.dislike)      return "dislike";
  if (row.like)         return "like";
  return null;
}
