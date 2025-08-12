import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";
import { Suspense } from "react";
import MembersTable from "@/components/members/MembersTable";
import { InvitesPanel } from "@/components/members/InvitesPanel";
import { updateMemberRoleAction } from "@/server/memberships/memberships.actions";

export default async function MembersPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  await requirePermission(tenant.id, "members.manage");

  async function onUpdateMemberRole(userId: string, newRoleKey: string) {
    "use server";
    return updateMemberRoleAction(tenant.id, userId, newRoleKey);
  }

  return (
    <div className="">
      <h1 className="text-2xl font-semibold mb-4">Members</h1>
      <InvitesPanel tenantId={tenant.id} />
      <Suspense>
        <MembersTable tenantId={tenant.id} onUpdateMemberRole={onUpdateMemberRole} />
      </Suspense>
    </div>
  );
}


