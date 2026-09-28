import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEventFn } from "@/lib/logging.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "At least 8 characters").max(200),
});

type FormValues = z.infer<typeof schema>;

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — HABÄNE Admin" },
      { name: "description", content: "Administrator sign in for the HABÄNE operations console." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Sign in — HABÄNE Admin" },
      {
        property: "og:description",
        content: "Administrator sign in for the HABÄNE operations console.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: FormValues) {
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setSubmitting(false);
    if (error) {
      void logAuthEventFn({
        data: { event: "failed_login", email: values.email, reason: error.message },
      }).catch(() => undefined);
      toast.error(error.message);
      return;
    }
    void logAuthEventFn({ data: { event: "admin_login", email: values.email } }).catch(
      () => undefined,
    );
    navigate({ to: "/admin" });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-sidebar p-12 text-sidebar-foreground lg:flex">
        <span className="eyebrow text-sidebar-primary">HABÄNE</span>
        <div>
          <h1 className="max-w-md text-5xl leading-[1.05] text-sidebar-foreground">
            Objects for the considered city.
          </h1>
          <p className="mt-6 max-w-sm text-sm text-sidebar-foreground/70">
            Operations console — catalogue, orders, returns and compliance in one place.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">Authorised personnel only.</p>
      </div>

      <div className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <span className="eyebrow text-muted-foreground">Administrator access</span>
          <h2 className="mt-3 text-3xl">Sign in</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Customer accounts do not exist — the storefront checks out as guest.
          </p>

          <form onSubmit={form.handleSubmit(onSubmit)} className="mt-8 space-y-5" noValidate>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" {...form.register("email")} />
              {form.formState.errors.email && (
                <p className="text-xs text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...form.register("password")}
              />
              {form.formState.errors.password && (
                <p className="text-xs text-destructive">{form.formState.errors.password.message}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </main>
  );
}
