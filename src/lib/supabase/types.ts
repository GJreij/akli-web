export type Database = {
  public: {
    Tables: {
      user: {
        Row: {
          id: string;
          created_at: string;
          updated_at: string | null;
          email: string | null;
          name: string | null;
          last_name: string | null;
          address: string | null;
          delivery_address: string | null;
          DoB: string | null;
          onboarding: boolean | null;
          role: string | null;
          tenant_id: number | null;
          usage_mode: string | null;
          reference: string | null;
          status: string | null;
          phone_number: string | null;
          akli_partner: boolean | null;
          non_akli_partner: boolean | null;
          self_built_diet: boolean | null;
        };
        Insert: Omit<Database["public"]["Tables"]["user"]["Row"], "created_at">;
        Update: Partial<Database["public"]["Tables"]["user"]["Row"]>;
      };
      daily_macro_target: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          user_id: string | null;
          tenant_id: number | null;
          kcal_target: number | null;
          protein_g: number | null;
          carbs_g: number | null;
          fat_g: number | null;
          saturated_fat_g: number | null;
          fiber_g: number | null;
          sugar_g: number | null;
          diet_type: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["daily_macro_target"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["daily_macro_target"]["Row"]
        >;
      };
      macro_price: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          proteing_g_price: number | null;
          carbs_g_price: number | null;
          fat_g_price: number | null;
          day_packaging_price: number | null;
          recipe_packaging_price: number | null;
          subrecipe_packaging_price: number | null;
          delivery_price: number | null;
        };
        Insert: never;
        Update: never;
      };
      meal_plan: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          user_id: string | null;
          start_date: string | null;
          end_date: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["meal_plan"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["meal_plan"]["Row"]>;
      };
      meal_plan_day: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          meal_plan_id: number | null;
          date: string | null;
          daily_macro_order_id: number | null;
          status: string | null;
          delivery_id: number | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["meal_plan_day"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["meal_plan_day"]["Row"]>;
      };
      recipe: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          name: string | null;
          description: string | null;
          instructions: string | null;
          could_be_breakfast: boolean | null;
          could_be_dinner: boolean | null;
          could_be_lunch: boolean | null;
          could_be_snack: boolean | null;
          prep_time: number | null;
          cook_time: number | null;
          always_available: boolean | null;
          photo: string | null;
          tenant_id: number | null;
        };
        Insert: never;
        Update: never;
      };
      weekly_menu: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          week_start_date: string | null;
          week_end_date: string | null;
          name: string | null;
          tenant_id: number | null;
        };
        Insert: never;
        Update: never;
      };
      weekly_menu_recipe: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          weekly_menu_id: number | null;
          recipe_id: number | null;
          available_from: string | null;
          available_to: string | null;
          always_available: boolean | null;
        };
        Insert: never;
        Update: never;
      };
      daily_menu: {
        Row: {
          id: number;
          date: string;
          meal_type: string;
          recipe_id: number;
          created_at: string | null;
        };
        Insert: never;
        Update: never;
      };
      delivery_slots: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          start_time: string | null;
          end_time: string | null;
        };
        Insert: never;
        Update: never;
      };
      delivery_slots_daily: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          delivery_slot_id: number | null;
          max_deliveries: number | null;
          current_count: number | null;
          delivery_date: string | null;
        };
        Insert: never;
        Update: never;
      };
      deliveries: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          delivery_date: string | null;
          delivery_slot_id: number | null;
          status: string | null;
          user_id: string | null;
          delivery_address: string | null;
          meal_plan_day_id: number | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["deliveries"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["deliveries"]["Row"]>;
      };
      promo_codes: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          code: string | null;
          description: string | null;
          discount_value: number | null;
          discount_type: string | null;
          scope: string;
          start_date: string | null;
          end_date: string | null;
          max_global_uses: number | null;
          max_uses_per_user: number | null;
          min_order_value: number | null;
          is_active: boolean | null;
          partner_id: string | null;
          user_id: string | null;
        };
        Insert: never;
        Update: never;
      };
      payment: {
        Row: {
          id: number;
          created_at: string;
          updated_at: string | null;
          meal_plan_day_id: number | null;
          status: string | null;
          provider: string | null;
          provider_payment_id: string | null;
          currency: string | null;
          amount: number | null;
          tenant_id: number | null;
          ordered_user_id: string | null;
          partner_at_order: string | null;
        };
        Insert: Omit<
          Database["public"]["Tables"]["payment"]["Row"],
          "id" | "created_at"
        >;
        Update: Partial<Database["public"]["Tables"]["payment"]["Row"]>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};
