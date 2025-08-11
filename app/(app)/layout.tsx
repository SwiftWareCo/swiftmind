import { ReactNode } from "react";
import { redirect, notFound } from "next/navigation";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { TenantProvider } from "@/components/tenant/TenantProvider";
import { createClient } from "@/server/supabase/server";
import { QueryProvider } from "@/components/providers/QueryProvider";
import {Toaster} from "@/components/ui/sonner"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const slug = await getTenantSlug();
  if (!slug) notFound();

  let tenant;
  try {
    tenant = await getTenantBySlug(slug);
  } catch (err: unknown) {
    console.error(err);
    notFound();
  }

  // Membership gating: ensure user is a member of this tenant
  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();

  if (membershipError) {
    console.error(membershipError);
    notFound();
  }
  if (!membership) {
    redirect(`/join?tenant=${encodeURIComponent(slug)}`);
  }

  return (
    <TenantProvider value={{ tenantId: tenant.id, slug: tenant.slug }}>
      <QueryProvider>{children}</QueryProvider>
      <Toaster richColors />
    </TenantProvider>
  );
}


