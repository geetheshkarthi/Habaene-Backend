/**
 * Non-component helpers shared by the analytics screens.
 * Kept out of AnalyticsKit.tsx so that file only exports components
 * (a requirement for React Fast Refresh).
 */
import { useState } from "react";
import { resolveDateRange, type DatePreset, type DateRange } from "@/lib/api/analytics";

/** Shared date-range state for every analytics report. */
export function useDateRange(initial: DatePreset = "last_30_days") {
  const [preset, setPreset] = useState<DatePreset>(initial);
  const [custom, setCustom] = useState<DateRange>(() => resolveDateRange("last_30_days"));
  const range = preset === "custom" ? custom : resolveDateRange(preset);
  return {
    range,
    pickerProps: {
      preset,
      onPresetChange: setPreset,
      custom,
      onCustomChange: setCustom,
    },
  };
}

export const CHART_COLORS = [
  "var(--color-chart-1, #8884d8)",
  "var(--color-chart-2, #82ca9d)",
  "var(--color-chart-3, #ffc658)",
  "var(--color-chart-4, #ff7f7f)",
  "var(--color-chart-5, #8dd1e1)",
];
