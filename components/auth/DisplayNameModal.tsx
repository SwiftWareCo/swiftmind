"use client";

import { useEffect, useState, useTransition } from "react";
import { ensureUserProfileAction } from "@/server/users/users.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Props = {
  shouldPrompt: boolean;
  initialDisplayName?: string | null;
};

export function DisplayNameModal({ shouldPrompt, initialDisplayName }: Props) {
  const [open, setOpen] = useState(shouldPrompt);
  const [displayName, setDisplayName] = useState(initialDisplayName ?? "");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setOpen(shouldPrompt);
  }, [shouldPrompt]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set your display name</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const dn = displayName.trim();
            if (!dn) {
              toast.error("Display name is required");
              return;
            }
            startTransition(async () => {
              const res = await ensureUserProfileAction(dn, avatarUrl.trim() || undefined);
              if (res.ok) {
                toast.success("Profile updated");
                setOpen(false);
                // reload to refresh header/members data
                window.location.reload();
              } else {
                toast.error(res.error || "Failed to update profile");
              }
            });
          }}
        >
          <div className="grid gap-2">
            <label className="text-sm">Display name</label>
            <Input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              required
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm">Avatar URL (optional)</label>
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://…"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}


