import { createClient } from "@/server/supabase/server";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";
import { Suspense } from "react";
import MembersTable from "@/components/members/MembersTable";
import { InvitesPanel } from "@/components/members/InvitesPanel";

export default async function MembersPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  await requirePermission(tenant.id, "members.manage");

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-semibold mb-4">Members</h1>
      {/* @ts-expect-error Server passing tenantId to client */}
      <InvitesPanel tenantId={tenant.id} />
      <Suspense>
        {/* Client table with pagination via TanStack Query */}
        {/* @ts-expect-error Server component passing tenantId */}
        <MembersTable tenantId={tenant.id} />
      </Suspense>

      <div className="mt-4 text-sm text-muted-foreground">Invites coming soon. Contact your CSM to add teammates.</div>
    </div>
  );
}


