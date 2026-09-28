/**
 * Contact form — writes to the admin panel's contact inbox.
 * SDK: submitContact()
 */
import { useState, type FormEvent } from "react";
import { api } from "./client";
import { HabaneApiError } from "@/lib/api/sdk";

export function ContactForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api.submitContact({
        name: String(form.get("name")),
        email: String(form.get("email")),
        subject: String(form.get("subject") || ""),
        message: String(form.get("message")),
      });
      setSent(true);
    } catch (err) {
      setError(
        err instanceof HabaneApiError && err.code === "rate_limited"
          ? "Too many messages — please try again in a few minutes."
          : "Message could not be sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (sent) return <p role="status">Thanks — we usually reply within one business day.</p>;

  return (
    <form onSubmit={submit}>
      <input name="name" required placeholder="Name" />
      <input name="email" type="email" required placeholder="Email" />
      <input name="subject" placeholder="Subject" />
      <textarea name="message" required minLength={10} placeholder="Message" />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send"}</button>
    </form>
  );
}
