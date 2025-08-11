import Link from "next/link";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/permissions/permissions.data";

function NavItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2.5 text-sm text-foreground/90 hover:bg-muted"
    >
      {label}
    </Link>
  );
}

export async function SidebarNav() {
  const slug = await getTenantSlug();
  if (!slug) return null;
  const tenant = await getTenantBySlug(slug);
  const isAdmin = await hasPermission(tenant.id, "members.manage");

  return (
    <nav className="py-4">
      <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Main</div>
      <NavItem href="/dashboard" label="Dashboard" />
      <NavItem href="/chat" label="Chat" />
      <NavItem href="/knowledge" label="Knowledge" />
      <NavItem href="/connections" label="Connections" />

      {isAdmin && (
        <div className="mt-4">
          <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</div>
          <NavItem href="/members" label="Members" />
          <NavItem href="/audit" label="Audit" />
          <NavItem href="/settings" label="Settings" />
          <NavItem href="/onboarding" label="Onboarding" />
        </div>
      )}
    </nav>
  );
}


