import { getCurrentUserMemberships } from "@/server/memberships/memberships.data";
import { TenantSwitcher } from "@/components/tenant/TenantSwitcher";

export async function Header() {
  const memberships = await getCurrentUserMemberships();
  return (
    <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-3 min-w-0">
          <TenantSwitcher memberships={memberships.map((m) => ({ id: m.tenant.id, slug: m.tenant.slug, name: m.tenant.name }))} />
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {/* Placeholder for user menu / search */}
        </div>
      </div>
    </div>
  );
}


