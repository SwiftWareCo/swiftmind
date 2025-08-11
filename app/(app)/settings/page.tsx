import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";

export default async function SettingsPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  await requirePermission(tenant.id, "members.manage");

  return (
    <div className="max-w-2xl space-y-2">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="rounded-md border p-4 text-sm">
        <div className="font-medium">Organization</div>
        <div className="mt-1 text-muted-foreground">Name: {tenant.name}</div>
        <div className="mt-1 text-muted-foreground">Slug: {tenant.slug}</div>
      </div>
      <div className="text-sm text-muted-foreground">For advanced changes, contact support.</div>
    </div>
  );
}


