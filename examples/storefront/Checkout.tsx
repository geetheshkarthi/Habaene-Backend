/**
 * Checkout — collects the address, applies a discount, then redirects to Stripe.
 * SDK: validateDiscount(), createCheckout()  (createOrder() for non-Stripe flows)
 */
import { useState, type FormEvent } from "react";
import { api } from "./client";
import { HabaneApiError, type AddressInput } from "@/lib/api/sdk";
import { CHECKOUT_CANCEL_URL, CHECKOUT_SUCCESS_URL } from "@/lib/config";
import { useCart } from "./CartContext";

export function Checkout() {
  const cart = useCart();
  const [email, setEmail] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountNote, setDiscountNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function applyDiscount() {
    setDiscountNote(null);
    try {
      const result = await api.validateDiscount(discountCode, cart.subtotal);
      setDiscountNote(
        result.valid ? `−${result.discount_amount?.toFixed(2)} €` : (result.reason ?? "Code not valid"),
      );
    } catch (err) {
      setDiscountNote(err instanceof HabaneApiError ? err.message : "Could not check code");
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);
    const shipping_address: AddressInput = {
      first_name: String(form.get("first_name")),
      last_name: String(form.get("last_name")),
      line1: String(form.get("line1")),
      postal_code: String(form.get("postal_code")),
      city: String(form.get("city")),
      country: String(form.get("country") || "DE"),
    };

    try {
      const session = await api.createCheckout({
        items: cart.toApiItems(),
        email,
        shipping_address,
        ...(discountCode ? { discount_code: discountCode } : {}),
        newsletter_opt_in: form.get("newsletter") === "on",
        gdpr_consent_text: "Accepted terms, privacy policy and right of withdrawal at checkout.",
        success_url: `${window.location.origin}${CHECKOUT_SUCCESS_URL}?order={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}${CHECKOUT_CANCEL_URL}`,
      });

      // Keep the order number so the success page can look the order up.
      window.sessionStorage.setItem("habane.lastOrder", session.order_number);
      cart.clear();

      if (session.checkout_url) {
        window.location.href = session.checkout_url;
        return;
      }
      setError("Payment is temporarily unavailable. Your order was saved as pending.");
    } catch (err) {
      if (err instanceof HabaneApiError) {
        // 409 conflict → stock changed while the cart sat idle.
        setError(
          err.code === "conflict"
            ? `${err.message} Please adjust your cart.`
            : err.code === "unavailable"
              ? "Payments are temporarily unavailable — please try again shortly."
              : err.message,
        );
      } else {
        setError("Checkout failed. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <input name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
      <input name="first_name" required placeholder="First name" />
      <input name="last_name" required placeholder="Last name" />
      <input name="line1" required placeholder="Street and number" />
      <input name="postal_code" required placeholder="Postal code" />
      <input name="city" required placeholder="City" />
      <input name="country" defaultValue="DE" required placeholder="Country (ISO-2)" />

      <input value={discountCode} onChange={(e) => setDiscountCode(e.target.value.toUpperCase())} placeholder="Discount code" />
      <button type="button" onClick={applyDiscount}>Apply</button>
      {discountNote && <p>{discountNote}</p>}

      <label>
        <input type="checkbox" name="newsletter" /> Send me the newsletter
      </label>

      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting || cart.count === 0}>
        {submitting ? "Redirecting…" : "Pay now"}
      </button>
    </form>
  );
}
