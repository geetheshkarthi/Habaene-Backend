/**
 * Return request — 14-day withdrawal, defect report or exchange request.
 * SDK: createReturn(), getReturn()
 */
import { useState, type FormEvent } from "react";
import { api } from "./client";
import { HabaneApiError, type PublicReturn } from "@/lib/api/sdk";

const TYPES = [
  { value: "withdrawal", label: "Withdraw from purchase (14 days)" },
  { value: "defect", label: "Report a defect" },
  { value: "exchange_request", label: "Request an exchange" },
] as const;

export function ReturnRequest() {
  const [created, setCreated] = useState<PublicReturn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      setCreated(
        await api.createReturn({
          order_number: String(form.get("order_number")).trim(),
          email: String(form.get("email")).trim(),
          type: form.get("type") as (typeof TYPES)[number]["value"],
          reason: String(form.get("reason")),
        }),
      );
    } catch (err) {
      if (err instanceof HabaneApiError) {
        setError(
          err.code === "not_found"
            ? "We couldn't match that order number and email."
            : err.code === "conflict"
              ? err.message // e.g. withdrawal window has passed, or a request already exists
              : err.message,
        );
      } else {
        setError("Return request failed.");
      }
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <p role="status">
        Request received — reference {created.id}. Status: {created.status}. We'll email you the next steps.
      </p>
    );
  }

  return (
    <form onSubmit={submit}>
      <input name="order_number" required placeholder="HB-2026-000123" />
      <input name="email" type="email" required placeholder="Email used at checkout" />
      <select name="type" defaultValue="withdrawal">
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <textarea name="reason" required minLength={5} placeholder="Reason" />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Submitting…" : "Submit request"}</button>
    </form>
  );
}

/** Status page: /returns/:id?email=… */
export function loadReturn(id: string, email: string) {
  return api.getReturn(id, email);
}
