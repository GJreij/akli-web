export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      affiliate_payouts: {
        Row: {
          affiliate_id: number
          amount: number
          created_at: string
          id: number
          note: string | null
          paid_at: string
          period_end: string | null
          period_start: string | null
        }
        Insert: {
          affiliate_id: number
          amount: number
          created_at?: string
          id?: number
          note?: string | null
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
        }
        Update: {
          affiliate_id?: number
          amount?: number
          created_at?: string
          id?: number
          note?: string | null
          paid_at?: string
          period_end?: string | null
          period_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "affiliate_payouts_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      affiliates: {
        Row: {
          commission_rate: number
          content_compliant: boolean
          created_at: string
          id: number
          joined_date: string
          notes: string | null
          personal_discount_rate: number | null
          status: string
          tier: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          commission_rate?: number
          content_compliant?: boolean
          created_at?: string
          id?: number
          joined_date?: string
          notes?: string | null
          personal_discount_rate?: number | null
          status?: string
          tier: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          commission_rate?: number
          content_compliant?: boolean
          created_at?: string
          id?: number
          joined_date?: string
          notes?: string | null
          personal_discount_rate?: number | null
          status?: string
          tier?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "affiliates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_event: {
        Row: {
          anon_id: string | null
          browser: string | null
          created_at: string
          device_type: string | null
          event_category: string
          event_name: string
          id: number
          metadata: Json | null
          os: string | null
          page: string | null
          referrer: string | null
          session_id: string | null
          user_id: string | null
          utm_campaign: string | null
          utm_medium: string | null
          utm_source: string | null
        }
        Insert: {
          anon_id?: string | null
          browser?: string | null
          created_at?: string
          device_type?: string | null
          event_category?: string
          event_name: string
          id?: never
          metadata?: Json | null
          os?: string | null
          page?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Update: {
          anon_id?: string | null
          browser?: string | null
          created_at?: string
          device_type?: string | null
          event_category?: string
          event_name?: string
          id?: never
          metadata?: Json | null
          os?: string | null
          page?: string | null
          referrer?: string | null
          session_id?: string | null
          user_id?: string | null
          utm_campaign?: string | null
          utm_medium?: string | null
          utm_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_event_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      automatic_discount_rules: {
        Row: {
          created_at: string
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string | null
          id: number
          is_active: boolean
          max_discount_amount: number | null
          min_order_days: number
          name: string
          stackable_with_promo: boolean
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value: number
          end_date?: string | null
          id?: number
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_days: number
          name: string
          stackable_with_promo?: boolean
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string | null
          id?: number
          is_active?: boolean
          max_discount_amount?: number | null
          min_order_days?: number
          name?: string
          stackable_with_promo?: boolean
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      daily_macro_order: {
        Row: {
          carbs_ordered: number | null
          created_at: string
          fat_ordered: number | null
          fiber_ordered: number | null
          for_date: string | null
          id: number
          kcal_ordered: number | null
          meal_plan_day_id: number | null
          order_date: string | null
          protein_ordered: number | null
          saturated_fat_ordered: number | null
          source: string | null
          status: string | null
          sugar_ordered: number | null
          tenant_id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          carbs_ordered?: number | null
          created_at?: string
          fat_ordered?: number | null
          fiber_ordered?: number | null
          for_date?: string | null
          id?: number
          kcal_ordered?: number | null
          meal_plan_day_id?: number | null
          order_date?: string | null
          protein_ordered?: number | null
          saturated_fat_ordered?: number | null
          source?: string | null
          status?: string | null
          sugar_ordered?: number | null
          tenant_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          carbs_ordered?: number | null
          created_at?: string
          fat_ordered?: number | null
          fiber_ordered?: number | null
          for_date?: string | null
          id?: number
          kcal_ordered?: number | null
          meal_plan_day_id?: number | null
          order_date?: string | null
          protein_ordered?: number | null
          saturated_fat_ordered?: number | null
          source?: string | null
          status?: string | null
          sugar_ordered?: number | null
          tenant_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_macro_order_meal_plan_day_id_fkey"
            columns: ["meal_plan_day_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_day"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_macro_order_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_macro_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_macro_target: {
        Row: {
          activity_level: number | null
          carbs_g: number | null
          created_at: string
          diet_type: string | null
          fat_g: number | null
          fiber_g: number | null
          goal: string | null
          height_cm: number | null
          id: number
          kcal_target: number | null
          method: string | null
          protein_g: number | null
          saturated_fat_g: number | null
          sex: string | null
          source: string | null
          sugar_g: number | null
          tenant_id: number | null
          updated_at: string | null
          user_id: string | null
          weight_kg: number | null
        }
        Insert: {
          activity_level?: number | null
          carbs_g?: number | null
          created_at?: string
          diet_type?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          goal?: string | null
          height_cm?: number | null
          id?: number
          kcal_target?: number | null
          method?: string | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          sex?: string | null
          source?: string | null
          sugar_g?: number | null
          tenant_id?: number | null
          updated_at?: string | null
          user_id?: string | null
          weight_kg?: number | null
        }
        Update: {
          activity_level?: number | null
          carbs_g?: number | null
          created_at?: string
          diet_type?: string | null
          fat_g?: number | null
          fiber_g?: number | null
          goal?: string | null
          height_cm?: number | null
          id?: number
          kcal_target?: number | null
          method?: string | null
          protein_g?: number | null
          saturated_fat_g?: number | null
          sex?: string | null
          source?: string | null
          sugar_g?: number | null
          tenant_id?: number | null
          updated_at?: string | null
          user_id?: string | null
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_macro_target_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daily_macro_target_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_menu: {
        Row: {
          created_at: string | null
          date: string
          id: number
          meal_type: string
          recipe_id: number
        }
        Insert: {
          created_at?: string | null
          date: string
          id?: number
          meal_type: string
          recipe_id: number
        }
        Update: {
          created_at?: string | null
          date?: string
          id?: number
          meal_type?: string
          recipe_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "daily_menu_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          created_at: string
          delivery_address: string | null
          delivery_date: string | null
          delivery_slot_id: number | null
          id: number
          meal_plan_day_id: number | null
          status: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_slot_id?: number | null
          id?: number
          meal_plan_day_id?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_address?: string | null
          delivery_date?: string | null
          delivery_slot_id?: number | null
          id?: number
          meal_plan_day_id?: number | null
          status?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_delivery_slot_id_fkey"
            columns: ["delivery_slot_id"]
            isOneToOne: false
            referencedRelation: "delivery_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_meal_plan_day_id_fkey"
            columns: ["meal_plan_day_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_day"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_slots: {
        Row: {
          created_at: string
          end_time: string | null
          id: number
          start_time: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          end_time?: string | null
          id?: number
          start_time?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          end_time?: string | null
          id?: number
          start_time?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      delivery_slots_daily: {
        Row: {
          created_at: string
          current_count: number | null
          delivery_date: string | null
          delivery_slot_id: number | null
          id: number
          max_deliveries: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          current_count?: number | null
          delivery_date?: string | null
          delivery_slot_id?: number | null
          id?: number
          max_deliveries?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          current_count?: number | null
          delivery_date?: string | null
          delivery_slot_id?: number | null
          id?: number
          max_deliveries?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "delivery_slots_daily_delivery_slot_id_fkey"
            columns: ["delivery_slot_id"]
            isOneToOne: false
            referencedRelation: "delivery_slots"
            referencedColumns: ["id"]
          },
        ]
      }
      ingredient: {
        Row: {
          carbs: number | null
          celery: boolean | null
          cereals_containing_gluten: boolean | null
          created_at: string
          crustaceans: boolean | null
          eggs: boolean | null
          fat: number | null
          fiber: number | null
          fish: boolean | null
          id: number
          kcal: number | null
          lupin: boolean | null
          milk: boolean | null
          molluscs: boolean | null
          mustard: boolean | null
          name: string | null
          peanuts: boolean | null
          protein: number | null
          saturated_fat: number | null
          serving_per_unit: number | null
          sesame: boolean | null
          soybeans: boolean | null
          sugar: number | null
          sulphites: boolean | null
          tenant_id: number | null
          tree_nuts: boolean | null
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          carbs?: number | null
          celery?: boolean | null
          cereals_containing_gluten?: boolean | null
          created_at?: string
          crustaceans?: boolean | null
          eggs?: boolean | null
          fat?: number | null
          fiber?: number | null
          fish?: boolean | null
          id?: number
          kcal?: number | null
          lupin?: boolean | null
          milk?: boolean | null
          molluscs?: boolean | null
          mustard?: boolean | null
          name?: string | null
          peanuts?: boolean | null
          protein?: number | null
          saturated_fat?: number | null
          serving_per_unit?: number | null
          sesame?: boolean | null
          soybeans?: boolean | null
          sugar?: number | null
          sulphites?: boolean | null
          tenant_id?: number | null
          tree_nuts?: boolean | null
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          carbs?: number | null
          celery?: boolean | null
          cereals_containing_gluten?: boolean | null
          created_at?: string
          crustaceans?: boolean | null
          eggs?: boolean | null
          fat?: number | null
          fiber?: number | null
          fish?: boolean | null
          id?: number
          kcal?: number | null
          lupin?: boolean | null
          milk?: boolean | null
          molluscs?: boolean | null
          mustard?: boolean | null
          name?: string | null
          peanuts?: boolean | null
          protein?: number | null
          saturated_fat?: number | null
          serving_per_unit?: number | null
          sesame?: boolean | null
          soybeans?: boolean | null
          sugar?: number | null
          sulphites?: boolean | null
          tenant_id?: number | null
          tree_nuts?: boolean | null
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingredient_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      kitchen_closure: {
        Row: {
          closure_date: string
          created_at: string | null
          id: number
          kitchen_id: number | null
          reason: string | null
        }
        Insert: {
          closure_date: string
          created_at?: string | null
          id?: never
          kitchen_id?: number | null
          reason?: string | null
        }
        Update: {
          closure_date?: string
          created_at?: string | null
          id?: never
          kitchen_id?: number | null
          reason?: string | null
        }
        Relationships: []
      }
      macro_price: {
        Row: {
          carbs_g_price: number | null
          created_at: string
          day_packaging_price: number | null
          delivery_price: number | null
          fat_g_price: number | null
          id: number
          proteing_g_price: number | null
          recipe_packaging_price: number | null
          subrecipe_packaging_price: number | null
          updated_at: string | null
        }
        Insert: {
          carbs_g_price?: number | null
          created_at?: string
          day_packaging_price?: number | null
          delivery_price?: number | null
          fat_g_price?: number | null
          id?: number
          proteing_g_price?: number | null
          recipe_packaging_price?: number | null
          subrecipe_packaging_price?: number | null
          updated_at?: string | null
        }
        Update: {
          carbs_g_price?: number | null
          created_at?: string
          day_packaging_price?: number | null
          delivery_price?: number | null
          fat_g_price?: number | null
          id?: number
          proteing_g_price?: number | null
          recipe_packaging_price?: number | null
          subrecipe_packaging_price?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      meal_plan: {
        Row: {
          created_at: string
          end_date: string | null
          id: number
          start_date: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          id?: number
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          end_date?: string | null
          id?: number
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_meal_plan_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_day: {
        Row: {
          created_at: string
          daily_macro_order_id: number | null
          date: string | null
          delivery_id: number | null
          id: number
          meal_plan_id: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          daily_macro_order_id?: number | null
          date?: string | null
          delivery_id?: number | null
          id?: number
          meal_plan_id?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          daily_macro_order_id?: number | null
          date?: string | null
          delivery_id?: number | null
          id?: number
          meal_plan_id?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_day_daily_macro_order_id_fkey"
            columns: ["daily_macro_order_id"]
            isOneToOne: false
            referencedRelation: "daily_macro_order"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_day_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_day_meal_plan_id_fkey"
            columns: ["meal_plan_id"]
            isOneToOne: false
            referencedRelation: "meal_plan"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_day_recipe: {
        Row: {
          cooking_status: string | null
          created_at: string
          id: number
          label: string | null
          meal_plan_day_id: number | null
          meal_type: string | null
          packaging_status: string | null
          recipe_id: number | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          cooking_status?: string | null
          created_at?: string
          id?: number
          label?: string | null
          meal_plan_day_id?: number | null
          meal_type?: string | null
          packaging_status?: string | null
          recipe_id?: number | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          cooking_status?: string | null
          created_at?: string
          id?: number
          label?: string | null
          meal_plan_day_id?: number | null
          meal_type?: string | null
          packaging_status?: string | null
          recipe_id?: number | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_day_recipe_meal_plan_day_id_fkey"
            columns: ["meal_plan_day_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_day"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_day_recipe_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_meal_plan_day_recipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plan_day_recipe_serving: {
        Row: {
          carbs_calculated: number | null
          cooking_status: string | null
          created_at: string
          fat_calculated: number | null
          fiber_calculated: number | null
          id: number
          kcal_calculated: number | null
          meal_plan_day_recipe_id: number | null
          portioning_status: string | null
          protein_calculated: number | null
          recipe_subrecipe_serving_calculated: number | null
          saturated_calculated: number | null
          subrecipe_id: number | null
          sugar_calculated: number | null
          updated_at: string | null
          weight_after_cooking: number | null
        }
        Insert: {
          carbs_calculated?: number | null
          cooking_status?: string | null
          created_at?: string
          fat_calculated?: number | null
          fiber_calculated?: number | null
          id?: number
          kcal_calculated?: number | null
          meal_plan_day_recipe_id?: number | null
          portioning_status?: string | null
          protein_calculated?: number | null
          recipe_subrecipe_serving_calculated?: number | null
          saturated_calculated?: number | null
          subrecipe_id?: number | null
          sugar_calculated?: number | null
          updated_at?: string | null
          weight_after_cooking?: number | null
        }
        Update: {
          carbs_calculated?: number | null
          cooking_status?: string | null
          created_at?: string
          fat_calculated?: number | null
          fiber_calculated?: number | null
          id?: number
          kcal_calculated?: number | null
          meal_plan_day_recipe_id?: number | null
          portioning_status?: string | null
          protein_calculated?: number | null
          recipe_subrecipe_serving_calculated?: number | null
          saturated_calculated?: number | null
          subrecipe_id?: number | null
          sugar_calculated?: number | null
          updated_at?: string | null
          weight_after_cooking?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "meal_plan_day_recipe_serving_meal_plan_day_recipe_id_fkey"
            columns: ["meal_plan_day_recipe_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_day_recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plan_day_recipe_serving_subrecipe_id_fkey"
            columns: ["subrecipe_id"]
            isOneToOne: false
            referencedRelation: "subrecipe"
            referencedColumns: ["id"]
          },
        ]
      }
      payment: {
        Row: {
          affiliate_id: number | null
          amount: number | null
          commission_amount: number | null
          commission_rate: number | null
          created_at: string
          currency: string | null
          id: number
          meal_plan_day_id: number | null
          ordered_user_id: string | null
          partner_at_order: string | null
          provider: string | null
          provider_payment_id: string | null
          status: string | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          affiliate_id?: number | null
          amount?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          currency?: string | null
          id?: number
          meal_plan_day_id?: number | null
          ordered_user_id?: string | null
          partner_at_order?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          affiliate_id?: number | null
          amount?: number | null
          commission_amount?: number | null
          commission_rate?: number | null
          created_at?: string
          currency?: string | null
          id?: number
          meal_plan_day_id?: number | null
          ordered_user_id?: string | null
          partner_at_order?: string | null
          provider?: string | null
          provider_payment_id?: string | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_meal_plan_day_id_fkey"
            columns: ["meal_plan_day_id"]
            isOneToOne: false
            referencedRelation: "meal_plan_day"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_ordered_user_id_fkey"
            columns: ["ordered_user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_partner_at_order_fkey"
            columns: ["partner_at_order"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_code_usage: {
        Row: {
          created_at: string
          id: number
          promo_code_id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          promo_code_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          promo_code_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_code_usage_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_code_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_codes: {
        Row: {
          affiliate_id: number | null
          auto_paused: boolean
          code: string | null
          commission_rate_override: number | null
          created_at: string
          description: string | null
          discount_type: string | null
          discount_value: number | null
          end_date: string | null
          id: number
          is_active: boolean | null
          max_discount_amount: number | null
          max_global_uses: number | null
          max_uses_per_user: number | null
          min_order_days: number | null
          min_order_value: number | null
          scope: string
          start_date: string | null
          updated_at: string | null
          user_id: string | null
          waives_delivery: boolean
        }
        Insert: {
          affiliate_id?: number | null
          auto_paused?: boolean
          code?: string | null
          commission_rate_override?: number | null
          created_at?: string
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          end_date?: string | null
          id?: number
          is_active?: boolean | null
          max_discount_amount?: number | null
          max_global_uses?: number | null
          max_uses_per_user?: number | null
          min_order_days?: number | null
          min_order_value?: number | null
          scope?: string
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          waives_delivery?: boolean
        }
        Update: {
          affiliate_id?: number | null
          auto_paused?: boolean
          code?: string | null
          commission_rate_override?: number | null
          created_at?: string
          description?: string | null
          discount_type?: string | null
          discount_value?: number | null
          end_date?: string | null
          id?: number
          is_active?: boolean | null
          max_discount_amount?: number | null
          max_global_uses?: number | null
          max_uses_per_user?: number | null
          min_order_days?: number | null
          min_order_value?: number | null
          scope?: string
          start_date?: string | null
          updated_at?: string | null
          user_id?: string | null
          waives_delivery?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_affiliate_id_fkey"
            columns: ["affiliate_id"]
            isOneToOne: false
            referencedRelation: "affiliates"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe: {
        Row: {
          always_available: boolean | null
          cook_time: number | null
          could_be_breakfast: boolean | null
          could_be_dinner: boolean | null
          could_be_lunch: boolean | null
          could_be_snack: boolean | null
          created_at: string
          description: string | null
          id: number
          instructions: string | null
          name: string | null
          photo: string | null
          prep_time: number | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          always_available?: boolean | null
          cook_time?: number | null
          could_be_breakfast?: boolean | null
          could_be_dinner?: boolean | null
          could_be_lunch?: boolean | null
          could_be_snack?: boolean | null
          created_at?: string
          description?: string | null
          id?: number
          instructions?: string | null
          name?: string | null
          photo?: string | null
          prep_time?: number | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          always_available?: boolean | null
          cook_time?: number | null
          could_be_breakfast?: boolean | null
          could_be_dinner?: boolean | null
          could_be_lunch?: boolean | null
          could_be_snack?: boolean | null
          created_at?: string
          description?: string | null
          id?: number
          instructions?: string | null
          name?: string | null
          photo?: string | null
          prep_time?: number | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      recipe_subrecipe: {
        Row: {
          created_at: string
          id: number
          max_serving: number | null
          optional: boolean | null
          recipe_id: number | null
          subrecipe_id: number | null
          subrecipe_label: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          max_serving?: number | null
          optional?: boolean | null
          recipe_id?: number | null
          subrecipe_id?: number | null
          subrecipe_label?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          max_serving?: number | null
          optional?: boolean | null
          recipe_id?: number | null
          subrecipe_id?: number | null
          subrecipe_label?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recipe_subrecipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipe_subrecipe_subrecipe_id_fkey"
            columns: ["subrecipe_id"]
            isOneToOne: false
            referencedRelation: "subrecipe"
            referencedColumns: ["id"]
          },
        ]
      }
      subrec_ingred: {
        Row: {
          created_at: string
          id: number
          ingredient_id: number | null
          optional: boolean | null
          quantity: number | null
          subrecipe_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          ingredient_id?: number | null
          optional?: boolean | null
          quantity?: number | null
          subrecipe_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          ingredient_id?: number | null
          optional?: boolean | null
          quantity?: number | null
          subrecipe_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subrec_ingred_ingredient_id_fkey"
            columns: ["ingredient_id"]
            isOneToOne: false
            referencedRelation: "ingredient"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subrec_ingred_subrecipe_id_fkey"
            columns: ["subrecipe_id"]
            isOneToOne: false
            referencedRelation: "subrecipe"
            referencedColumns: ["id"]
          },
        ]
      }
      subrecipe: {
        Row: {
          carbs: number | null
          created_at: string
          description: string | null
          fat: number | null
          fiber: number | null
          freezable: boolean | null
          id: number
          instructions: string | null
          kcal: number | null
          max_serving: number | null
          name: string | null
          prep_time: string | null
          protein: number | null
          saturated_fat: number | null
          sugar: number | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          carbs?: number | null
          created_at?: string
          description?: string | null
          fat?: number | null
          fiber?: number | null
          freezable?: boolean | null
          id?: number
          instructions?: string | null
          kcal?: number | null
          max_serving?: number | null
          name?: string | null
          prep_time?: string | null
          protein?: number | null
          saturated_fat?: number | null
          sugar?: number | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          carbs?: number | null
          created_at?: string
          description?: string | null
          fat?: number | null
          fiber?: number | null
          freezable?: boolean | null
          id?: number
          instructions?: string | null
          kcal?: number | null
          max_serving?: number | null
          name?: string | null
          prep_time?: string | null
          protein?: number | null
          saturated_fat?: number | null
          sugar?: number | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subrecipe_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant: {
        Row: {
          created_at: string
          id: number
          industry: string | null
          logo: string | null
          name: string | null
          subscription_plan: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          industry?: string | null
          logo?: string | null
          name?: string | null
          subscription_plan?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          industry?: string | null
          logo?: string | null
          name?: string | null
          subscription_plan?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user: {
        Row: {
          created_at: string
          DoB: string | null
          email: string | null
          id: string
          last_name: string | null
          name: string | null
          onboarding: boolean | null
          phone_number: string | null
          role: string | null
          status: string | null
          tenant_id: number | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          DoB?: string | null
          email?: string | null
          id: string
          last_name?: string | null
          name?: string | null
          onboarding?: boolean | null
          phone_number?: string | null
          role?: string | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          DoB?: string | null
          email?: string | null
          id?: string
          last_name?: string | null
          name?: string | null
          onboarding?: boolean | null
          phone_number?: string | null
          role?: string | null
          status?: string | null
          tenant_id?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      user_delivery_address: {
        Row: {
          address_text: string
          created_at: string
          id: number
          is_default: boolean
          label: string | null
          lat: number | null
          lng: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          address_text: string
          created_at?: string
          id?: number
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          address_text?: string
          created_at?: string
          id?: number
          is_default?: boolean
          label?: string | null
          lat?: number | null
          lng?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_delivery_address_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user_delivery_preference: {
        Row: {
          created_at: string
          delivery_slot_id: number | null
          id: number
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          delivery_slot_id?: number | null
          id?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          delivery_slot_id?: number | null
          id?: number
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_delivery_preference_selivery_slot_id_fkey"
            columns: ["delivery_slot_id"]
            isOneToOne: false
            referencedRelation: "delivery_slots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_delivery_preference_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      user_recipe_preferences: {
        Row: {
          comment: string | null
          created_at: string
          dislike: boolean | null
          dont_include: boolean | null
          id: number
          like: boolean | null
          recipe_id: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          comment?: string | null
          created_at?: string
          dislike?: boolean | null
          dont_include?: boolean | null
          id?: number
          like?: boolean | null
          recipe_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          comment?: string | null
          created_at?: string
          dislike?: boolean | null
          dont_include?: boolean | null
          id?: number
          like?: boolean | null
          recipe_id?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_recipe_preferences_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_recipe_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_menu: {
        Row: {
          created_at: string
          id: number
          name: string | null
          tenant_id: number | null
          updated_at: string | null
          week_end_date: string | null
          week_start_date: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          name?: string | null
          tenant_id?: number | null
          updated_at?: string | null
          week_end_date?: string | null
          week_start_date?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          name?: string | null
          tenant_id?: number | null
          updated_at?: string | null
          week_end_date?: string | null
          week_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_menu_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenant"
            referencedColumns: ["id"]
          },
        ]
      }
      weekly_menu_recipe: {
        Row: {
          always_available: boolean | null
          available_from: string | null
          available_to: string | null
          created_at: string
          id: number
          recipe_id: number | null
          updated_at: string | null
          weekly_menu_id: number | null
        }
        Insert: {
          always_available?: boolean | null
          available_from?: string | null
          available_to?: string | null
          created_at?: string
          id?: number
          recipe_id?: number | null
          updated_at?: string | null
          weekly_menu_id?: number | null
        }
        Update: {
          always_available?: boolean | null
          available_from?: string | null
          available_to?: string | null
          created_at?: string
          id?: number
          recipe_id?: number | null
          updated_at?: string | null
          weekly_menu_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_menu_recipe_recipe_id_fkey"
            columns: ["recipe_id"]
            isOneToOne: false
            referencedRelation: "recipe"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weekly_menu_recipe_weekly_menu_id_fkey"
            columns: ["weekly_menu_id"]
            isOneToOne: false
            referencedRelation: "weekly_menu"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      update_subrecipe_macros: {
        Args: { p_subrecipe_id: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
