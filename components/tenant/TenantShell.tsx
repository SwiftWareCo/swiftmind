import { ReactNode } from "react";
import { SidebarNav } from "@/components/tenant/SidebarNav";
import { Header } from "@/components/tenant/Header";

export function TenantShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-background text-foreground">
      <div className="grid grid-rows-[auto_1fr] md:grid-rows-[1fr] md:grid-cols-[240px_1fr] min-h-dvh">
        <aside className="hidden md:block border-r bg-muted/20">
          <div className="sticky top-0 h-dvh overflow-y-auto">
            <SidebarNav />
          </div>
        </aside>
        <main className="flex flex-col min-w-0">
          <Header />
          <div className="p-4 sm:p-6 md:p-8 min-w-0">{children}</div>
        </main>
      </div>
    </div>
  );
}


