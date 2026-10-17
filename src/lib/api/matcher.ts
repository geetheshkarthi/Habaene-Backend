/**
 * "What are you moving toward?" — the guided product match on the storefront
 * homepage. Stored as JSON in cms_homepage.matcher.
 *
 * Questions are a free-form list (add / remove / rename); each answer has a
 * stable `value` that recommendation rules refer to.
 */

export interface MatcherOption {
  /** stable id used by rules — never shown to customers */
  value: string;
  /** text shown to the customer */
  label: string;
}

export interface MatcherQuestion {
  /** stable id used by rules */
  id: string;
  title: string;
  options: MatcherOption[];
}

export interface MatcherRule {
  /** question id -> required answer value; a missing / "" entry means "any" */
  conditions: Record<string, string>;
  product_id: string;
  /** optional custom sentence under the recommendation */
  reason: string;
}

export interface MatcherConfig {
  questions: MatcherQuestion[];
  rules: MatcherRule[];
  default_product_id: string;
}

export const DEFAULT_QUESTIONS: MatcherQuestion[] = [
  {
    id: "duration",
    title: "Trip length",
    options: [
      { value: "short", label: "1–3 days" },
      { value: "medium", label: "4–7 days" },
      { value: "long", label: "8+ days" },
    ],
  },
  {
    id: "mode",
    title: "Movement mode",
    options: [
      { value: "air", label: "Air" },
      { value: "rail", label: "Rail" },
      { value: "city", label: "City" },
    ],
  },
  {
    id: "mood",
    title: "Travel mood",
    options: [
      { value: "focused", label: "Focused" },
      { value: "electric", label: "Electric" },
      { value: "slow", label: "Unhurried" },
    ],
  },
];

export const newId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}`;

/** Accepts the stored JSON (current or the first, object-shaped version) and returns a clean config. */
export function normalizeMatcher(raw: unknown): MatcherConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  let questions: MatcherQuestion[];
  if (Array.isArray(r["questions"])) {
    questions = (r["questions"] as MatcherQuestion[]).map((q) => ({
      id: q.id,
      title: q.title ?? "",
      options: (q.options ?? []).map((o) => ({ value: o.value, label: o.label ?? "" })),
    }));
  } else if (r["questions"] && typeof r["questions"] === "object") {
    // first version: { duration: { title, options: { short: "…" } }, … }
    const legacy = r["questions"] as Record<string, { title?: string; options?: Record<string, string> }>;
    questions = DEFAULT_QUESTIONS.map((d) => ({
      id: d.id,
      title: legacy[d.id]?.title || d.title,
      options: d.options.map((o) => ({ value: o.value, label: legacy[d.id]?.options?.[o.value] ?? o.label })),
    }));
  } else {
    questions = DEFAULT_QUESTIONS.map((q) => ({ ...q, options: q.options.map((o) => ({ ...o })) }));
  }

  const rules: MatcherRule[] = Array.isArray(r["rules"])
    ? (r["rules"] as Record<string, unknown>[]).map((x) => {
        const conditions: Record<string, string> =
          x["conditions"] && typeof x["conditions"] === "object"
            ? { ...(x["conditions"] as Record<string, string>) }
            : {};
        for (const k of ["duration", "mode", "mood"]) {
          if (typeof x[k] === "string" && x[k]) conditions[k] = x[k] as string;
        }
        return {
          conditions,
          product_id: String(x["product_id"] ?? ""),
          reason: String(x["reason"] ?? ""),
        };
      })
    : [];

  return { questions, rules, default_product_id: String(r["default_product_id"] ?? "") };
}
