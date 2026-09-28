import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, type NewsletterSubscriber } from "./types";

export async function getSubscribers(search?: string): Promise<NewsletterSubscriber[]> {
  let query = supabase
    .from("newsletter_subscribers")
    .select("*")
    .order("subscribed_at", { ascending: false });
  if (search?.trim()) query = query.ilike("email", `%${search.trim()}%`);
  return unwrap(await query);
}

export async function countSubscribers(): Promise<number> {
  const { count, error } = await supabase
    .from("newsletter_subscribers")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function setSubscriberActive(id: string, isActive: boolean): Promise<void> {
  assertOk(
    await supabase
      .from("newsletter_subscribers")
      .update({
        is_active: isActive,
        unsubscribed_at: isActive ? null : new Date().toISOString(),
      })
      .eq("id", id),
  );
}

export async function deleteSubscriber(id: string): Promise<void> {
  assertOk(await supabase.from("newsletter_subscribers").delete().eq("id", id));
}
