"use client";

import { useState, useMemo } from "react";
import { ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { buildTenantUrl } from "@/lib/utils/utils";

type Item = { id: string; slug: string; name: string };

export function TenantSwitcher({ memberships }: { memberships: Item[] }) {
  const [open, setOpen] = useState(false);
  const items = useMemo(() => {
    const map = new Map<string, { id: string; slug: string; name: string }>();
    for (const m of memberships) {
      if (!map.has(m.id)) map.set(m.id, m);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [memberships]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <span className="truncate max-w-[160px]">{items[0]?.name || "Select organization"}</span>
          <ChevronsUpDown className="h-4 w-4 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="p-0 w-[240px]">
        <div className="max-h-64 overflow-y-auto py-1">
          {items.length === 0 && (
            <div className="px-3 py-2 text-sm text-muted-foreground">No organizations</div>
          )}
          {items.map((it) => (
            <button
              key={it.id}
              onClick={() => {
                setOpen(false);
                // Use centralized tenant URL builder
                const tenantUrl = buildTenantUrl(it.slug, "/dashboard");
                window.location.href = tenantUrl;
              }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
            >
              {it.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}


