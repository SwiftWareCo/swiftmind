"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/server/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/utils";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Session = { id: string; title: string; last_message_at: string };

type Props = {
  tenantId: string;
  activeSessionId: string | null;
  onSelect: (sessionId: string) => void;
  onCreate: (sessionId: string) => void;
  onSoftDelete?: (sessionId: string) => Promise<void>;
};

export function SessionTabs({ tenantId, activeSessionId, onSelect, onCreate, onSoftDelete }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  const { data } = useQuery<{ id: string; title: string; last_message_at: string }[], Error>({
    queryKey: ["chat-sessions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, title, last_message_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const createMutation = useMutation<{ id: string }, Error, void>({
    mutationFn: async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(userErr.message);
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ tenant_id: tenantId, created_by: userId })
        .select("id")
        .single<{ id: string }>();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["chat-sessions", tenantId] });
      onCreate(res.id);
      toast.success("Chat created");
    },
    onError: (e) => toast.error(e.message),
  });

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: async (sessionId: string) => {
      if (onSoftDelete) {
        await onSoftDelete(sessionId);
        return;
      }
      const { error } = await supabase
        .from("chat_sessions")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", sessionId)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      setPendingDeleteId(null);
      await qc.invalidateQueries({ queryKey: ["chat-sessions", tenantId] });
      toast.success("Chat deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTitle, setRenameTitle] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const renameMutation = useMutation<void, Error, { id: string; title: string }>({
    mutationFn: async ({ id, title }) => {
      const { error } = await supabase
        .from("chat_sessions")
        .update({ title })
        .eq("id", id)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["chat-sessions", tenantId] });
      setRenameOpen(false);
      setRenameId(null);
      setRenameTitle("");
      toast.success("Title saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const sessions = (data || []) as Session[];
  const active = activeSessionId && sessions.find((s) => s.id === activeSessionId) ? activeSessionId : (sessions[0]?.id ?? null);

  return (
    <div className="mb-3 flex items-center gap-2">
      <Tabs value={active ?? undefined} onValueChange={(v) => onSelect(v)} className="flex-1">
        <TabsList className={cn("overflow-x-auto w-full max-w-full justify-start gap-1")}
          style={{ scrollbarWidth: "thin" }}
        >
          {sessions.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="flex items-center gap-2 cursor-pointer">
              <span className="max-w-[200px] truncate">{s.title || "New chat"}</span>
              <span
                className="rounded px-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameId(s.id);
                  setRenameTitle(s.title || "");
                  setRenameOpen(true);
                }}
                aria-label="Rename session"
                role="button"
                aria-hidden={false}
              >
                ✎
              </span>
              <ConfirmDialog
                title="Delete chat?"
                description="This will permanently remove the chat and its messages."
                confirmLabel={deleteMutation.isPending ? "Deleting…" : "Delete"}
                onConfirm={async () => {
                  setPendingDeleteId(s.id);
                  await deleteMutation.mutateAsync(s.id);
                }}
                trigger={
                  <span
                    className="rounded px-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Close session"
                    role="button"
                    aria-hidden={false}
                  >
                    ×
                  </span>
                }
              />
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <Button size="sm" onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
        {createMutation.isPending ? "Creating…" : "+ New"}
      </Button>
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename chat</DialogTitle>
          </DialogHeader>
          <Input value={renameTitle} onChange={(e) => setRenameTitle(e.target.value)} placeholder="Enter a title" />
          <DialogFooter>
            <Button
              onClick={() => renameId && renameMutation.mutate({ id: renameId, title: renameTitle.trim() || "" })}
              disabled={renameMutation.isPending}
            >
              {renameMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


