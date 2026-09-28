/**
 * Order lookup — guest order status page (order number + email, no account).
 * SDK: getOrder()
 */
import { useState, type FormEvent } from "react";
import { api } from "./client";
import { HabaneApiError, type PublicOrder } from "@/lib/api/sdk";

export function OrderLookup() {
  const [order, setOrder] = useState<PublicOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    setOrder(null);
    try {
      setOrder(
        await api.getOrder(String(form.get("order_number")).trim(), String(form.get("email")).trim()),
      );
    } catch (err) {
      // The API returns 404 for both "unknown order" and "wrong email" on purpose.
      setError(
        err instanceof HabaneApiError && err.code === "not_found"
          ? "No order found for that number and email."
          : "Lookup failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  const money = (v: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);

  return (
    <section>
      <form onSubmit={submit}>
        <input name="order_number" required placeholder="HB-2026-000123" />
        <input name="email" type="email" required placeholder="Email used at checkout" />
        <button type="submit" disabled={busy}>{busy ? "Searching…" : "Find my order"}</button>
      </form>

      {error && <p role="alert">{error}</p>}

      {order && (
        <article>
          <h2>{order.order_number}</h2>
          <p>Status: {order.status} · Payment: {order.payment_status}</p>
          {order.tracking_number && (
            <p>{order.shipping_carrier}: {order.tracking_number}</p>
          )}
          <ul>
            {order.items.map((item) => (
              <li key={`${item.product_code}-${item.size ?? ""}`}>
                {item.quantity} × {item.product_name} — {money(item.subtotal)}
              </li>
            ))}
          </ul>
          <p>Subtotal {money(order.subtotal)}</p>
          <p>Shipping {money(order.shipping_cost)}</p>
          <p>incl. {order.vat_rate}% VAT {money(order.vat_amount)}</p>
          <p><strong>Total {money(order.total)}</strong></p>
          {order.withdrawal_deadline && (
            <p>You can withdraw from this purchase until {new Date(order.withdrawal_deadline).toLocaleDateString("de-DE")}.</p>
          )}
        </article>
      )}
    </section>
  );
}
