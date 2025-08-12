"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Permission = { key: string; description: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  roleKey: string | null;
  grouped: Record<string, Permission[]>;
  grants: Record<string, boolean>;
  setGrants: (updater: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  onSave: () => void;
  isSaving?: boolean;
  roleName: string;
  roleDescription: string;
  setRoleName: (next: string) => void;
  setRoleDescription: (next: string) => void;
};

export function EditPermissionsDialog({ open, onOpenChange, roleKey, grouped, grants, setGrants, onSave, isSaving, roleName, roleDescription, setRoleName, setRoleDescription }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Edit role & permissions — {roleKey}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          {/* Role details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="grid gap-2">
              <label className="text-xs">Role name</label>
              <Input value={roleName} onChange={(e) => setRoleName(e.target.value)} placeholder="Editor" />
            </div>
            <div className="grid gap-2">
              <label className="text-xs">Description</label>
              <Input value={roleDescription} onChange={(e) => setRoleDescription(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(grouped).map(([group, perms]) => (
              <Card key={group} className="border-muted/50">
                <CardContent className="p-2">
                  <div className="px-1 py-1 flex items-center justify-between">
                    <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group}</div>
                    <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                      {perms.reduce((acc, p) => acc + (grants[p.key] ? 1 : 0), 0)}/{perms.length}
                    </Badge>
                  </div>
                  <div className="grid gap-1">
                    {perms.map((p) => (
                      <label key={p.key} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                        <Checkbox
                          className="size-3.5"
                          checked={Boolean(grants[p.key])}
                          onCheckedChange={(val) => setGrants((g) => ({ ...g, [p.key]: Boolean(val) }))}
                        />
                        <span className="leading-tight">
                          <span className="font-medium">{p.key}</span>
                          {p.description ? <span className="text-muted-foreground"> — {p.description}</span> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" disabled={isSaving || !roleKey} onClick={onSave}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


