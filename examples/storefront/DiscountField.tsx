/**
 * Discount validation — check a code against the current cart subtotal.
 * SDK: validateDiscount()
 *
 * Validation is advisory only: the server re-validates and re-applies the code
 * during /orders and /checkout, so a stale or tampered client value is ignored.
 */
import { useState } from "react";
import { api } from "./client";
import { HabaneApiError, type DiscountValidation } from "@/lib/api/sdk";

export function DiscountField({
  subtotal,
  onApplied,
}: {
  subtotal: number;
  onApplied: (code: string | null, discountAmount: number) => void;
}) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<DiscountValidation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const validation = await api.validateDiscount(code.trim().toUpperCase(), subtotal);
      setResult(validation);
      onApplied(validation.valid ? validation.code : null, validation.discount_amount ?? 0);
    } catch (err) {
      setResult(null);
      onApplied(null, 0);
      setError(err instanceof HabaneApiError ? err.message : "Could not validate the code");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Discount code"
        aria-label="Discount code"
      />
      <button type="button" onClick={check} disabled={busy || code.trim().length === 0}>
        {busy ? "Checking…" : "Apply"}
      </button>

      {error && <p role="alert">{error}</p>}
      {result?.valid && (
        <p role="status">
          {result.type === "percent" ? `${result.value}% off` : `${result.value} € off`} — you save{" "}
          {result.discount_amount?.toFixed(2)} €
        </p>
      )}
      {result && !result.valid && <p role="alert">{result.reason ?? "This code is not valid."}</p>}
    </div>
  );
}
