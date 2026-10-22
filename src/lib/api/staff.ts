import { supabase } from "@/integrations/supabase/client";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface StaffRole {
  id: string;
  name: string;
  permissions: string[];
  created_at: string;
}

export interface StaffMember {
  user_id: string;
  login_id: string;
  display_name: string;
  role_id: string;
  created_at: string;
}

function friendly(error: { message: string }): Error {
  if (/relation .*staff_|schema cache|could not find the table/i.test(error.message)) {
    return new Error("Roles aren't set up in the database yet — run the Staff Roles SQL first.");
  }
  if (/duplicate|unique/i.test(error.message)) return new Error("A role with that name already exists.");
  return new Error(error.message);
}

export async function getStaffRoles(): Promise<StaffRole[]> {
  const { data, error } = await db.from("staff_roles").select("*").order("created_at");
  if (error) throw friendly(error);
  return (data ?? []) as StaffRole[];
}

export async function createStaffRole(name: string, permissions: string[]): Promise<StaffRole> {
  const { data, error } = await db
    .from("staff_roles")
    .insert({ name: name.trim(), permissions })
    .select("*")
    .single();
  if (error) throw friendly(error);
  return data as StaffRole;
}

export async function updateStaffRole(id: string, name: string, permissions: string[]): Promise<void> {
  const { error } = await db
    .from("staff_roles")
    .update({ name: name.trim(), permissions, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw friendly(error);
}

export async function deleteStaffRole(id: string): Promise<void> {
  const { error } = await db.from("staff_roles").delete().eq("id", id);
  if (error) {
    if (/foreign key|violates/i.test(error.message)) {
      throw new Error("This role still has people assigned. Move or delete them first.");
    }
    throw friendly(error);
  }
}

export async function getStaffMembers(): Promise<StaffMember[]> {
  const { data, error } = await db.from("staff_members").select("*").order("created_at");
  if (error) throw friendly(error);
  return (data ?? []) as StaffMember[];
}

export async function setStaffMemberRole(userId: string, roleId: string): Promise<void> {
  const { error } = await db.from("staff_members").update({ role_id: roleId }).eq("user_id", userId);
  if (error) throw friendly(error);
}

export async function getMyPermissions(): Promise<string[]> {
  const { data, error } = await supabase.rpc("my_permissions");
  if (error) {
    // Before the Staff Roles SQL is run the function doesn't exist: every
    // signed-in administrator is a main administrator then.
    if (/could not find the function|schema cache/i.test(error.message)) return ["*"];
    throw error;
  }
  return (data as unknown as string[]) ?? [];
}
