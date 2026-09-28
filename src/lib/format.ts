export const EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });

export function money(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return EUR.format(Number.isFinite(n) ? n : 0);
}

export function num(value: number | string | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function dateShort(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("de-DE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Net amount from a gross (VAT-inclusive) amount. */
export function netFromGross(gross: number, vatRate: number): number {
  return round2(gross / (1 + vatRate));
}

/** VAT portion of a gross (VAT-inclusive) amount. */
export function vatFromGross(gross: number, vatRate: number): number {
  return round2(gross - gross / (1 + vatRate));
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Serialise rows to semicolon-delimited CSV (the separator Excel expects in de-DE).
 * Accepts any object shape so typed API rows export without casting at each call site.
 */
export function toCsv(rows: readonly object[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(";"),
    ...rows.map((row) => headers.map((h) => escape((row as Record<string, unknown>)[h])).join(";")),
  ].join("\n");
}

export function downloadFile(filename: string, contents: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 14-day EU withdrawal deadline, counted from delivery. */
export function withdrawalDeadline(deliveredAt: string | null | undefined, days = 14): Date | null {
  if (!deliveredAt) return null;
  const d = new Date(deliveredAt);
  d.setDate(d.getDate() + days);
  return d;
}
