/**
 * Newsletter — double-opt-in-ready subscribe form with explicit consent text.
 * SDK: subscribeNewsletter(), unsubscribeNewsletter()
 */
import { useState, type FormEvent } from "react";
import { api } from "./client";
import { HabaneApiError } from "@/lib/api/sdk";

const CONSENT_TEXT =
  "I agree to receive the HABÄNE newsletter and can unsubscribe at any time.";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState("sending");
    try {
      await api.subscribeNewsletter({
        email,
        consent_text: CONSENT_TEXT,
        source: "footer",
      });
      setState("done");
      setMessage("Thanks — check your inbox for the welcome email.");
      setEmail("");
    } catch (error) {
      setState("error");
      setMessage(
        error instanceof HabaneApiError && error.code === "validation_error"
          ? "Please enter a valid email address."
          : "Subscription failed. Please try again.",
      );
    }
  }

  return (
    <form onSubmit={submit}>
      <label htmlFor="newsletter-email">Newsletter</label>
      <input
        id="newsletter-email"
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <p><small>{CONSENT_TEXT}</small></p>
      <button type="submit" disabled={state === "sending"}>
        {state === "sending" ? "Subscribing…" : "Subscribe"}
      </button>
      {message && <p role={state === "error" ? "alert" : "status"}>{message}</p>}
    </form>
  );
}

/** Unsubscribe page: /newsletter/unsubscribe?token=… */
export async function handleUnsubscribe(token: string) {
  await api.unsubscribeNewsletter({ token });
}
