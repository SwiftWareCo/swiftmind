"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/utils";

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "block px-4 py-2.5 text-sm",
        active ? "bg-muted font-medium" : "text-foreground/90 hover:bg-muted"
      )}
    >
      {label}
    </Link>
  );
}

export function SidebarNavClient({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname() || "/";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="py-4">
      <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Main</div>
      <NavItem href="/dashboard" label="Dashboard" active={isActive("/dashboard")} />
      <NavItem href="/chat" label="Chat" active={isActive("/chat")} />
      <NavItem href="/knowledge" label="Knowledge" active={isActive("/knowledge")} />
      <NavItem href="/connections" label="Connections" active={isActive("/connections")} />

      {isAdmin && (
        <div className="mt-4">
          <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Admin</div>
          <NavItem href="/members" label="Members" active={isActive("/members")} />
          <NavItem href="/audit" label="Audit" active={isActive("/audit")} />
          <NavItem href="/settings" label="Settings" active={isActive("/settings")} />
          <NavItem href="/onboarding" label="Onboarding" active={isActive("/onboarding")} />
        </div>
      )}
    </nav>
  );
}


