"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/utils";

function NavItem({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={cn(
        "block px-4 py-2.5 text-sm cursor-pointer",
        active ? "bg-slate-800 text-slate-100 font-medium" : "text-slate-300 hover:bg-slate-800/50 hover:text-slate-100"
      )}
    >
      {label}
    </Link>
  );
}

export function SidebarNavClient({ isAdmin, canAccessKnowledge }: { isAdmin: boolean; canAccessKnowledge: boolean }) {
  const pathname = usePathname() || "/";
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <nav className="py-4">
      <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Main</div>
      <NavItem href="/dashboard" label="Dashboard" active={isActive("/dashboard")} />
      <NavItem href="/chat" label="Chat" active={isActive("/chat")} />
      {canAccessKnowledge && (
        <NavItem href="/knowledge" label="Knowledge" active={isActive("/knowledge")} />
      )}

      {isAdmin && (
        <div className="mt-4">
          <div className="px-4 pb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Admin</div>
          <NavItem href="/members" label="Members" active={isActive("/members")} />
          <NavItem href="/audit" label="Audit" active={isActive("/audit")} />
          <NavItem href="/settings" label="Settings" active={isActive("/settings")} />
      <NavItem href="/connections" label="Connections" active={isActive("/connections")} />

        </div>
      )}
    </nav>
  );
}


