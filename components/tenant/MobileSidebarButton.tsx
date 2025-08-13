"use client";

import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SidebarNavClient } from "@/components/tenant/SidebarNavClient";
import { Menu } from "lucide-react";

export function MobileSidebarButton({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="md:hidden" aria-label="Open navigation">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="p-0 w-[264px]">
        <SheetHeader className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
        </SheetHeader>
        <div className="pt-2 pb-4">
          <SidebarNavClient isAdmin={isAdmin} />
        </div>
      </SheetContent>
    </Sheet>
  );
}


