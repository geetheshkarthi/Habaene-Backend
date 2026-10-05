export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17";
  };
  public: {
    Tables: {
      contact_messages: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_handled: boolean;
          message: string;
          name: string;
          subject: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          is_handled?: boolean;
          message: string;
          name: string;
          subject?: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_handled?: boolean;
          message?: string;
          name?: string;
          subject?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          anonymized_at: string | null;
          created_at: string;
          deleted_at: string | null;
          email: string;
          first_name: string;
          gdpr_consent_at: string | null;
          gdpr_consent_text: string | null;
          id: string;
          last_name: string;
          newsletter_opt_in: boolean;
          phone: string | null;
          stripe_customer_id: string | null;
          updated_at: string;
        };
        Insert: {
          anonymized_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email: string;
          first_name?: string;
          gdpr_consent_at?: string | null;
          gdpr_consent_text?: string | null;
          id?: string;
          last_name?: string;
          newsletter_opt_in?: boolean;
          phone?: string | null;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Update: {
          anonymized_at?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          email?: string;
          first_name?: string;
          gdpr_consent_at?: string | null;
          gdpr_consent_text?: string | null;
          id?: string;
          last_name?: string;
          newsletter_opt_in?: boolean;
          phone?: string | null;
          stripe_customer_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      discount_codes: {
        Row: {
          code: string;
          created_at: string;
          deleted_at: string | null;
          description: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          max_uses: number | null;
          min_order: number;
          type: Database["public"]["Enums"]["discount_type"];
          updated_at: string;
          uses_so_far: number;
          value: number;
        };
        Insert: {
          code: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order?: number;
          type?: Database["public"]["Enums"]["discount_type"];
          updated_at?: string;
          uses_so_far?: number;
          value: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          max_uses?: number | null;
          min_order?: number;
          type?: Database["public"]["Enums"]["discount_type"];
          updated_at?: string;
          uses_so_far?: number;
          value?: number;
        };
        Relationships: [];
      };
      event_logs: {
        Row: {
          actor: string | null;
          context: Json;
          created_at: string;
          event: string;
          id: string;
          level: string;
          message: string | null;
          order_id: string | null;
          request_id: string | null;
        };
        Insert: {
          actor?: string | null;
          context?: Json;
          created_at?: string;
          event: string;
          id?: string;
          level?: string;
          message?: string | null;
          order_id?: string | null;
          request_id?: string | null;
        };
        Update: {
          actor?: string | null;
          context?: Json;
          created_at?: string;
          event?: string;
          id?: string;
          level?: string;
          message?: string | null;
          order_id?: string | null;
          request_id?: string | null;
        };
        Relationships: [];
      };
      newsletter_subscribers: {
        Row: {
          consent_text: string;
          created_at: string;
          email: string;
          id: string;
          ip_address: string | null;
          is_active: boolean;
          source: string;
          subscribed_at: string;
          unsubscribe_token: string;
          unsubscribed_at: string | null;
          updated_at: string;
        };
        Insert: {
          consent_text?: string;
          created_at?: string;
          email: string;
          id?: string;
          ip_address?: string | null;
          is_active?: boolean;
          source?: string;
          subscribed_at?: string;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
          updated_at?: string;
        };
        Update: {
          consent_text?: string;
          created_at?: string;
          email?: string;
          id?: string;
          ip_address?: string | null;
          is_active?: boolean;
          source?: string;
          subscribed_at?: string;
          unsubscribe_token?: string;
          unsubscribed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          order_id: string;
          product_code: string;
          product_id: string | null;
          product_image: string | null;
          product_name: string;
          quantity: number;
          size: string | null;
          subtotal: number;
          unit_price: number;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          order_id: string;
          product_code?: string;
          product_id?: string | null;
          product_image?: string | null;
          product_name: string;
          quantity: number;
          size?: string | null;
          subtotal: number;
          unit_price: number;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          order_id?: string;
          product_code?: string;
          product_id?: string | null;
          product_image?: string | null;
          product_name?: string;
          quantity?: number;
          size?: string | null;
          subtotal?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          billing_address: Json;
          cancelled_at: string | null;
          carrier_shipment_id: string | null;
          created_at: string;
          currency: string;
          customer_email: string;
          customer_id: string | null;
          customer_name: string;
          customer_phone: string | null;
          deleted_at: string | null;
          delivered_at: string | null;
          discount_amount: number;
          discount_code: string | null;
          gdpr_consent_at: string | null;
          gdpr_consent_text: string | null;
          id: string;
          notes: string | null;
          order_number: string;
          payment_intent_id: string | null;
          payment_method: string | null;
          payment_status: Database["public"]["Enums"]["payment_status"];
          razorpay_order_id: string | null;
          razorpay_payment_id: string | null;
          shipped_at: string | null;
          shipping_address: Json;
          shipping_carrier: string | null;
          shipping_cost: number;
          slice_order_id: string | null;
          slice_payment_id: string | null;
          status: Database["public"]["Enums"]["order_status"];
          stripe_session_id: string | null;
          subtotal: number;
          total: number;
          tracking_number: string | null;
          updated_at: string;
          vat_amount: number;
          vat_rate: number;
        };
        Insert: {
          billing_address?: Json;
          cancelled_at?: string | null;
          carrier_shipment_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_email: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          deleted_at?: string | null;
          delivered_at?: string | null;
          discount_amount?: number;
          discount_code?: string | null;
          gdpr_consent_at?: string | null;
          gdpr_consent_text?: string | null;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_intent_id?: string | null;
          payment_method?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          shipped_at?: string | null;
          shipping_address?: Json;
          shipping_carrier?: string | null;
          shipping_cost?: number;
          slice_order_id?: string | null;
          slice_payment_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_session_id?: string | null;
          subtotal?: number;
          total?: number;
          tracking_number?: string | null;
          updated_at?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Update: {
          billing_address?: Json;
          cancelled_at?: string | null;
          carrier_shipment_id?: string | null;
          created_at?: string;
          currency?: string;
          customer_email?: string;
          customer_id?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          deleted_at?: string | null;
          delivered_at?: string | null;
          discount_amount?: number;
          discount_code?: string | null;
          gdpr_consent_at?: string | null;
          gdpr_consent_text?: string | null;
          id?: string;
          notes?: string | null;
          order_number?: string;
          payment_intent_id?: string | null;
          payment_method?: string | null;
          payment_status?: Database["public"]["Enums"]["payment_status"];
          razorpay_order_id?: string | null;
          razorpay_payment_id?: string | null;
          shipped_at?: string | null;
          shipping_address?: Json;
          shipping_carrier?: string | null;
          shipping_cost?: number;
          slice_order_id?: string | null;
          slice_payment_id?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          stripe_session_id?: string | null;
          subtotal?: number;
          total?: number;
          tracking_number?: string | null;
          updated_at?: string;
          vat_amount?: number;
          vat_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          badge: string | null;
          blueprint: Json;
          card_image: string | null;
          care_instructions: string;
          category: Database["public"]["Enums"]["product_category"];
          code: string;
          colors: Json;
          cost_price: number;
          created_at: string;
          deleted_at: string | null;
          description: string;
          id: string;
          images: string[];
          is_active: boolean;
          materials: string;
          mood: Json;
          name: string;
          pack_items: Json;
          passport_code: string | null;
          passport_role: string;
          passport_service: string;
          position: number;
          price: number;
          product_story: string;
          sizes: Json;
          slug: string;
          specs: Json;
          stock: number;
          subtitle: string;
          updated_at: string;
          vat_rate: number;
          warranty_info: string;
          weight_kg: number;
        };
        Insert: {
          badge?: string | null;
          blueprint?: Json;
          card_image?: string | null;
          care_instructions?: string;
          category?: Database["public"]["Enums"]["product_category"];
          code: string;
          colors?: Json;
          cost_price?: number;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          id?: string;
          images?: string[];
          is_active?: boolean;
          materials?: string;
          mood?: Json;
          name: string;
          pack_items?: Json;
          passport_code?: string | null;
          passport_role?: string;
          passport_service?: string;
          position?: number;
          price: number;
          product_story?: string;
          sizes?: Json;
          slug: string;
          specs?: Json;
          stock?: number;
          subtitle?: string;
          updated_at?: string;
          vat_rate?: number;
          warranty_info?: string;
          weight_kg?: number;
        };
        Update: {
          badge?: string | null;
          blueprint?: Json;
          card_image?: string | null;
          care_instructions?: string;
          category?: Database["public"]["Enums"]["product_category"];
          code?: string;
          colors?: Json;
          cost_price?: number;
          created_at?: string;
          deleted_at?: string | null;
          description?: string;
          id?: string;
          images?: string[];
          is_active?: boolean;
          materials?: string;
          mood?: Json;
          name?: string;
          pack_items?: Json;
          passport_code?: string | null;
          passport_role?: string;
          passport_service?: string;
          position?: number;
          price?: number;
          product_story?: string;
          sizes?: Json;
          slug?: string;
          specs?: Json;
          stock?: number;
          subtitle?: string;
          updated_at?: string;
          vat_rate?: number;
          warranty_info?: string;
          weight_kg?: number;
        };
        Relationships: [];
      };
      return_events: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          note: string | null;
          return_id: string;
          status: Database["public"]["Enums"]["return_status"];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          return_id: string;
          status: Database["public"]["Enums"]["return_status"];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          note?: string | null;
          return_id?: string;
          status?: Database["public"]["Enums"]["return_status"];
        };
        Relationships: [
          {
            foreignKeyName: "return_events_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "returns";
            referencedColumns: ["id"];
          },
        ];
      };
      returns: {
        Row: {
          created_at: string;
          customer_email: string;
          id: string;
          items_received_at: string | null;
          notes: string | null;
          order_id: string | null;
          order_number: string | null;
          reason: string;
          refund_amount: number | null;
          refund_at: string | null;
          return_label_url: string | null;
          status: Database["public"]["Enums"]["return_status"];
          stripe_refund_id: string | null;
          submitted_at: string;
          type: Database["public"]["Enums"]["return_type"];
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          customer_email: string;
          id?: string;
          items_received_at?: string | null;
          notes?: string | null;
          order_id?: string | null;
          order_number?: string | null;
          reason?: string;
          refund_amount?: number | null;
          refund_at?: string | null;
          return_label_url?: string | null;
          status?: Database["public"]["Enums"]["return_status"];
          stripe_refund_id?: string | null;
          submitted_at?: string;
          type?: Database["public"]["Enums"]["return_type"];
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          customer_email?: string;
          id?: string;
          items_received_at?: string | null;
          notes?: string | null;
          order_id?: string | null;
          order_number?: string | null;
          reason?: string;
          refund_amount?: number | null;
          refund_at?: string | null;
          return_label_url?: string | null;
          status?: Database["public"]["Enums"]["return_status"];
          stripe_refund_id?: string | null;
          submitted_at?: string;
          type?: Database["public"]["Enums"]["return_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "returns_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      store_settings: {
        Row: {
          brand_name: string;
          business_address: Json;
          commercial_register_number: string;
          created_at: string;
          currency: string;
          default_vat_rate: number;
          favicon_url: string | null;
          free_shipping_threshold: number | null;
          id: string;
          invoice_prefix: string;
          legal_company_name: string;
          logo_url: string | null;
          returns_address: Json;
          shipping_cost: number;
          singleton: boolean;
          social_links: Json;
          storefront_url: string | null;
          support_email: string;
          support_phone: string;
          updated_at: string;
          vat_id: string;
          withdrawal_window_days: number;
        };
        Insert: {
          brand_name?: string;
          business_address?: Json;
          commercial_register_number?: string;
          created_at?: string;
          currency?: string;
          default_vat_rate?: number;
          favicon_url?: string | null;
          free_shipping_threshold?: number | null;
          id?: string;
          invoice_prefix?: string;
          legal_company_name?: string;
          logo_url?: string | null;
          returns_address?: Json;
          shipping_cost?: number;
          singleton?: boolean;
          social_links?: Json;
          storefront_url?: string | null;
          support_email?: string;
          support_phone?: string;
          updated_at?: string;
          vat_id?: string;
          withdrawal_window_days?: number;
        };
        Update: {
          brand_name?: string;
          business_address?: Json;
          commercial_register_number?: string;
          created_at?: string;
          currency?: string;
          default_vat_rate?: number;
          favicon_url?: string | null;
          free_shipping_threshold?: number | null;
          id?: string;
          invoice_prefix?: string;
          legal_company_name?: string;
          logo_url?: string | null;
          returns_address?: Json;
          shipping_cost?: number;
          singleton?: boolean;
          social_links?: Json;
          storefront_url?: string | null;
          support_email?: string;
          support_phone?: string;
          updated_at?: string;
          vat_id?: string;
          withdrawal_window_days?: number;
        };
        Relationships: [];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_order_number: { Args: never; Returns: string };
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"];
          _user_id: string;
        };
        Returns: boolean;
      };
      is_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      app_role: "admin";
      discount_type: "percent" | "fixed";
      order_status:
        "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled" | "returned";
      payment_status: "pending" | "paid" | "failed" | "refunded";
      product_category: "system" | "carry" | "luggage";
      return_status: "submitted" | "approved" | "rejected" | "items_received" | "refunded";
      return_type: "withdrawal" | "defect" | "exchange_request";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
      discount_type: ["percent", "fixed"],
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "returned",
      ],
      payment_status: ["pending", "paid", "failed", "refunded"],
      product_category: ["system", "carry", "luggage"],
      return_status: ["submitted", "approved", "rejected", "items_received", "refunded"],
      return_type: ["withdrawal", "defect", "exchange_request"],
    },
  },
} as const;
