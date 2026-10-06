/**
 * reports.ts — Saved custom reports (Analytics → Custom Reports).
 * custom_reports has existed in the database since the catchup migration,
 * but nothing ever read or wrote to it — "Save" was a static message
 * pointing at a migration that had, in fact, already been applied.
 */
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { assertOk, unwrap } from "./types";

export interface SavedReport {
  id: string;
  name: string;
  description: string | null;
  metric: string;
  dimensions: string[];
  filters: Record<string, unknown>;
  date_range: string | null;
  grouping: string | null;
  created_by: string | null;
  is_scheduled: boolean;
  schedule_cron: string | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
}

export async function getSavedReports(): Promise<SavedReport[]> {
  return unwrap(
    await supabase.from("custom_reports").select("*").order("created_at", { ascending: false }),
  ) as SavedReport[];
}

export interface CreateSavedReportInput {
  name: string;
  metric: string;
  dimensions: string[];
  filters: Json;
  date_range: string | null;
  grouping: string | null;
}

export async function createSavedReport(input: CreateSavedReportInput): Promise<SavedReport> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return unwrap(
    await supabase
      .from("custom_reports")
      .insert({ ...input, created_by: user?.id ?? null })
      .select()
      .single(),
  ) as SavedReport;
}

export async function deleteSavedReport(id: string): Promise<void> {
  assertOk(await supabase.from("custom_reports").delete().eq("id", id));
}
