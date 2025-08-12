import { ReactNode } from "react";
import { redirect, notFound } from "next/navigation";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { TenantProvider } from "@/components/tenant/TenantProvider";
import { createClient } from "@/server/supabase/server";
import { QueryProvider } from "@/components/providers/QueryProvider";
import {Toaster} from "@/components/ui/sonner"
import { TenantShell } from "@/components/tenant/TenantShell";
import { headers } from "next/headers";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const slug = await getTenantSlug();
  // When hitting apex host (no slug), redirect users with memberships to a tenant or show a friendly message
  if (!slug) {
    // Resolve first membership and direct to dashboard on that tenant, otherwise show notFound
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: first } = await supabase
        .from("memberships")
        .select("tenants:tenant_id(slug)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle<{ tenants: { slug: string } | { slug: string }[] | null }>();
      let firstSlug: string | null = null;
      const t = first?.tenants;
      if (t) firstSlug = Array.isArray(t) ? t[0]?.slug ?? null : t.slug;
      const baseDomain = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN;
      if (firstSlug && baseDomain) {
        const host = (await headers()).get("host") || "";
        const port = host.includes(":") ? host.split(":")[1] : "";
        const portPart = port ? `:${port}` : "";
        const proto = ((await headers()).get("x-forwarded-proto") || "http").split(",")[0];
        redirect(`${proto}://${firstSlug}.${baseDomain}${portPart}/dashboard`);
      }
      redirect("/dashboard");
    }
    notFound();
  }

  let tenant;
  try {
    tenant = await getTenantBySlug(slug);
  } catch (err: unknown) {
    console.error(err);
    notFound();
  }

  // Membership gating
  const [{ count: totalMemberships }, { data: membership, error: membershipError }] = await Promise.all([
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id),
    supabase
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string }>(),
  ]);

  if ((totalMemberships ?? 0) === 0) {
    redirect("/no-access");
  }
  if (membershipError) {
    console.error(membershipError);
    notFound();
  }
  if (!membership) {
    return (
      <div className="p-8">
        <div className="mx-auto max-w-lg text-center space-y-2">
          <h1 className="text-xl font-semibold">Not a member of this organization</h1>
          <p className="text-sm text-muted-foreground">You don’t have access to this tenant. Switch to an organization you belong to.</p>
          <div className="mt-4">
            {/* Minimal header with switcher for convenience */}
            <Toaster />
          </div>
        </div>
      </div>
    );
  }

  return (
    <TenantProvider value={{ tenantId: tenant.id, slug: tenant.slug }}>
      <QueryProvider>
        <TenantShell>{children}</TenantShell>
      </QueryProvider>
      <Toaster richColors />
    </TenantProvider>
  );
}


