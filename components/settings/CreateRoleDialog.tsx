"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (payload: { key: string; name: string; description?: string | null }) => void;
  isPending?: boolean;
};

export function CreateRoleDialog({ open, onOpenChange, onCreate, isPending }: Props) {
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create role</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <label className="text-sm">Key</label>
            <Input value={key} onChange={(e) => setKey(e.target.value.toLowerCase())} placeholder="e.g. editor" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Editor" />
          </div>
          <div className="grid gap-2">
            <label className="text-sm">Description</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={isPending}
              onClick={() => onCreate({ key: key.trim(), name: name.trim(), description: description.trim() || undefined })}
            >
              {isPending ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


