import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loginIdToEmail } from "./permissions";

type SuperAdminCheck = { rpc: (fn: "is_super_admin") => PromiseLike<{ data: unknown }> };

/** Only main administrators (the admin role) may manage staff accounts. */
async function assertSuperAdmin(supabase: SuperAdminCheck) {
  const { data } = await supabase.rpc("is_super_admin");
  if (data !== true) throw new Error("Only a main administrator can do this.");
}

const loginIdSchema = z
  .string()
  .trim()
  .min(3, "User ID must be at least 3 characters")
  .max(60)
  .regex(/^[A-Za-z0-9._@+-]+$/, "User ID can use letters, numbers and . _ - @ + only");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);

/** Create a staff login (User ID + password) with a role. */
export const createStaffUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        loginId: loginIdSchema,
        displayName: z.string().trim().max(100).default(""),
        password: passwordSchema,
        roleId: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: role } = await supabaseAdmin
      .from("staff_roles" as never)
      .select("id")
      .eq("id", data.roleId)
      .maybeSingle();
    if (!role) throw new Error("That role no longer exists.");

    const email = loginIdToEmail(data.loginId);
    const created = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.displayName },
    });
    if (created.error || !created.data.user) {
      const msg = created.error?.message ?? "Could not create the user";
      throw new Error(/already|registered|exists/i.test(msg) ? "That User ID is already taken." : msg);
    }
    const userId = created.data.user.id;

    const { error } = await supabaseAdmin.from("staff_members" as never).insert({
      user_id: userId,
      login_id: data.loginId,
      display_name: data.displayName,
      role_id: data.roleId,
    } as never);
    if (error) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw new Error(/duplicate|unique/i.test(error.message) ? "That User ID is already taken." : error.message);
    }

    // New sign-ups are mirrored into the Customers list by a database trigger;
    // staff are not customers, so take them back out.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabaseAdmin as any).from("customers").delete().eq("auth_user_id", userId);

    return { userId };
  });

/** Set a new password for a staff member. */
export const setStaffPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ userId: z.string().uuid(), password: passwordSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await supabaseAdmin
      .from("staff_members" as never)
      .select("user_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!member) throw new Error("That is not a staff account.");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Delete a staff login completely. */
export const deleteStaffUserFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: member } = await supabaseAdmin
      .from("staff_members" as never)
      .select("user_id")
      .eq("user_id", data.userId)
      .maybeSingle();
    if (!member) throw new Error("That is not a staff account.");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
