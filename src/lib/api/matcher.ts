/**
 * "What are you moving toward?" — the guided product match on the storefront
 * homepage. Stored as JSON in cms_homepage.matcher; anything missing falls back
 * to the defaults below (which mirror the original hardcoded copy).
 */

export type MatcherGroup = "duration" | "mode" | "mood";

export interface MatcherQuestion {
  title: string;
  /** option value -> label shown to the customer */
  options: Record<string, string>;
}

export interface MatcherRule {
  /** "" = any */
  duration: string;
  mode: string;
  mood: string;
  product_id: string;
  /** optional custom sentence under the recommendation */
  reason: string;
}

export interface MatcherConfig {
  eyebrow: string;
  label: string;
  heading_1: string;
  heading_2: string;
  heading_accent: string;
  description: string;
  questions: Record<MatcherGroup, MatcherQuestion>;
  rules: MatcherRule[];
  default_product_id: string;
}

export const MATCHER_OPTION_KEYS: Record<MatcherGroup, string[]> = {
  duration: ["short", "medium", "long"],
  mode: ["air", "rail", "city"],
  mood: ["focused", "electric", "slow"],
};

export const DEFAULT_MATCHER: MatcherConfig = {
  eyebrow: "02 / PERSONAL MATCH",
  label: "Three decisions. One recommendation.",
  heading_1: "WHAT ARE YOU",
  heading_2: "MOVING",
  heading_accent: "TOWARD?",
  description:
    "Instead of making customers decode specifications, this guided match translates trip intent into the right object.",
  questions: {
    duration: {
      title: "Trip length",
      options: { short: "1–3 days", medium: "4–7 days", long: "8+ days" },
    },
    mode: {
      title: "Movement mode",
      options: { air: "Air", rail: "Rail", city: "City" },
    },
    mood: {
      title: "Travel mood",
      options: { focused: "Focused", electric: "Electric", slow: "Unhurried" },
    },
  },
  rules: [],
  default_product_id: "",
};

/** Fill gaps in a stored config with the defaults. */
export function normalizeMatcher(raw: unknown): MatcherConfig {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<MatcherConfig>;
  const d = DEFAULT_MATCHER;
  const questions = {} as Record<MatcherGroup, MatcherQuestion>;
  (Object.keys(d.questions) as MatcherGroup[]).forEach((g) => {
    const q = r.questions?.[g];
    questions[g] = {
      title: q?.title || d.questions[g].title,
      options: { ...d.questions[g].options, ...(q?.options ?? {}) },
    };
  });
  return {
    eyebrow: r.eyebrow ?? d.eyebrow,
    label: r.label ?? d.label,
    heading_1: r.heading_1 ?? d.heading_1,
    heading_2: r.heading_2 ?? d.heading_2,
    heading_accent: r.heading_accent ?? d.heading_accent,
    description: r.description ?? d.description,
    questions,
    rules: Array.isArray(r.rules) ? r.rules : [],
    default_product_id: r.default_product_id ?? "",
  };
}
