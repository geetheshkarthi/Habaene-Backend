import { supabase } from "@/integrations/supabase/client";
import { assertOk, unwrap, type Customer } from "./types";
import { getOrdersByCustomerEmail } from "./orders";

export interface CustomerListRow extends Customer {
  order_count: number;
  total_spent: number;
}

export async function getCustomers(search?: string): Promise<CustomerListRow[]> {
  let query = supabase
    .from("customers")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });
  if (search?.trim()) {
    const term = `%${search.trim()}%`;
    query = query.or(`email.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`);
  }
  const customers = unwrap(await query);

  const orders = unwrap(
    await supabase.from("orders").select("customer_email, total, payment_status").is("deleted_at", null),
  );

  return customers.map((c) => {
    const own = orders.filter((o) => o.customer_email === c.email);
    return {
      ...c,
      order_count: own.length,
      total_spent: own
        .filter((o) => o.payment_status === "paid")
        .reduce((sum, o) => sum + Number(o.total), 0),
    };
  });
}

export async function getCustomer(id: string): Promise<Customer> {
  return unwrap(await supabase.from("customers").select("*").eq("id", id).single());
}

export async function updateCustomer(id: string, input: Partial<Customer>): Promise<void> {
  assertOk(await supabase.from("customers").update(input).eq("id", id));
}

/** GDPR Art. 20 — full portable export of everything held on a customer. */
export async function exportCustomerData(id: string) {
  const customer = await getCustomer(id);
  const orders = await getOrdersByCustomerEmail(customer.email);
  const returns = unwrap(
    await supabase.from("returns").select("*").eq("customer_email", customer.email),
  );
  const newsletter = unwrap(
    await supabase.from("newsletter_subscribers").select("*").eq("email", customer.email),
  );
  return {
    exported_at: new Date().toISOString(),
    customer,
    orders,
    returns,
    newsletter_subscriptions: newsletter,
  };
}

/** GDPR Art. 17 — irreversibly anonymise personal data while keeping accounting records. */
export async function anonymiseCustomer(id: string): Promise<void> {
  const customer = await getCustomer(id);
  const stamp = new Date().toISOString();
  const anonEmail = `anonymised+${id}@habaene.invalid`;

  assertOk(
    await supabase
      .from("orders")
      .update({
        customer_email: anonEmail,
        customer_name: "Anonymised",
        customer_phone: null,
        shipping_address: {},
        billing_address: {},
      })
      .eq("customer_email", customer.email),
  );
  assertOk(await supabase.from("newsletter_subscribers").delete().eq("email", customer.email));
  assertOk(
    await supabase
      .from("customers")
      .update({
        email: anonEmail,
        first_name: "Anonymised",
        last_name: "",
        phone: null,
        stripe_customer_id: null,
        newsletter_opt_in: false,
        anonymized_at: stamp,
        deleted_at: stamp,
      })
      .eq("id", id),
  );
}
