"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createPromptVersionAction, activatePromptVersionAction, deletePromptVersionAction } from "@/server/settings/settings.actions";
import { updatePromptVersionAction } from "@/server/settings/settings.actions";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Props = { tenantId: string; isAdmin: boolean };

type VersionRow = {
  tenant_id: string;
  version: number;
  prompt: string;
  role_overrides: Record<string, string> | null;
  notes: string | null;
  created_at: string;
};

export function AssistantPromptSection({ tenantId, isAdmin }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const versionsQuery = useQuery({
    queryKey: ["assistant_prompt_versions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("assistant_prompt_versions")
        .select("tenant_id, version, prompt, role_overrides, notes, created_at")
        .eq("tenant_id", tenantId)
        .order("version", { ascending: false });
      if (error) throw new Error(error.message);
      return (data || []) as VersionRow[];
    },
    staleTime: 3000,
  });
  const activeQuery = useQuery({
    queryKey: ["active_assistant_prompt", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_active_assistant_prompt")
        .select("tenant_id, version, prompt, role_overrides, updated_at")
        .eq("tenant_id", tenantId)
        .maybeSingle<{ tenant_id: string; version: number; prompt: string; role_overrides: Record<string, string> | null; updated_at: string }>();
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 3000,
  });

  const [newPrompt, setNewPrompt] = useState("");
  const [notes, setNotes] = useState("");
  const [autoActivate, setAutoActivate] = useState(true);
  const [roleOverrides, setRoleOverrides] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [activateTarget, setActivateTarget] = useState<number | null>(null);
  // confirm dialog handled inline via trigger; no explicit open state

  const createVersion = useMutation({
    mutationFn: async () => {
      const res = await createPromptVersionAction({ tenantId, prompt: newPrompt, notes: notes || undefined, roleOverrides: roleOverrides, autoActivate });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      setNewPrompt("");
      setNotes("");
      setRoleOverrides({});
      versionsQuery.refetch();
      activeQuery.refetch();
      toast.success("Created new prompt version" + (autoActivate ? " and activated" : ""));
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to create version"),
  });

  const activateVersion = useMutation({
    mutationFn: async (v: number) => {
      const res = await activatePromptVersionAction({ tenantId, version: v });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      activeQuery.refetch();
      toast.success("Activated prompt version");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to activate version"),
  });

  const deleteVersion = useMutation({
    mutationFn: async (v: number) => {
      const res = await deletePromptVersionAction({ tenantId, version: v });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      versionsQuery.refetch();
      activeQuery.refetch();
      // reset selection if it was deleted
      if (selectedVersion && !versions.find((x) => x.version === selectedVersion)) setSelectedVersion(active?.version ?? null);
      toast.success("Deleted prompt version");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to delete version"),
  });

  const updateVersion = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("No version selected");
      const res = await updatePromptVersionAction({ tenantId, version: selected.version, prompt: editPrompt, notes: editNotes || null, roleOverrides: editOverrides });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      versionsQuery.refetch();
      toast.success("Updated prompt version");
      setEditOpen(false);
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Failed to update version"),
  });

  const active = activeQuery.data;
  const versions = versionsQuery.data || [];
  const [selectedVersion, setSelectedVersion] = useState<number | null>(active?.version ?? null);
  const selected = versions.find((v) => v.version === (selectedVersion ?? -1)) || (active ? { version: active.version, prompt: active.prompt, notes: "", role_overrides: active.role_overrides, tenant_id: active.tenant_id, created_at: active.updated_at } as unknown as VersionRow : null);
  const [diffOpen, setDiffOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editPrompt, setEditPrompt] = useState("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [editOverrides, setEditOverrides] = useState<Record<string, string>>({});

  const startEdit = () => {
    if (!selected) return;
    setEditPrompt(selected.prompt);
    setEditNotes(selected.notes || "");
    setEditOverrides(selected.role_overrides || {});
    setEditOpen(true);
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-lg font-medium">Assistant Prompt</div>
        {active && (
          <Badge variant="secondary">Active v{active.version}</Badge>
        )}
      </div>
      <div className="grid gap-2">
        <div className="text-sm font-medium">Prompt preview {selected ? <span className="text-muted-foreground">(v{selected.version}{selected.version === active?.version ? ", active" : ""})</span> : null}</div>
        <Textarea value={selected?.prompt || ""} readOnly rows={8} />
      </div>

      <div className="grid gap-2">
        <div className="text-sm font-medium">History</div>
        <div className="flex gap-2 items-center">
          <Select onValueChange={(val) => { const v = Number(val); setActivateTarget(v); setSelectedVersion(v); }} value={selectedVersion ? String(selectedVersion) : undefined}>
            <SelectTrigger className="w-64"><SelectValue placeholder="Select version" /></SelectTrigger>
            <SelectContent>
              {versions.map((v) => (
                <SelectItem key={v.version} value={String(v.version)}>
                  v{v.version} — {v.notes || ""} ({new Date(v.created_at).toLocaleDateString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ConfirmDialog
            trigger={<Button disabled={!isAdmin || !activateTarget || (active?.version === activateTarget) || activateVersion.isPending}>{activateVersion.isPending ? "Activating..." : "Activate"}</Button>}
            title="Activate prompt version?"
            description="This will switch the active system prompt for all chats in this tenant."
            confirmLabel="Activate"
            onConfirm={() => {
              if (activateTarget) activateVersion.mutate(activateTarget);
            }}
          />
          <ConfirmDialog
            trigger={<Button variant="destructive" disabled={!isAdmin || !selectedVersion || selectedVersion === active?.version || deleteVersion.isPending}>{deleteVersion.isPending ? "Deleting..." : "Delete"}</Button>}
            title="Delete prompt version?"
            description="This cannot be undone and will remove the version from history."
            confirmLabel="Delete"
            onConfirm={() => {
              if (selectedVersion) deleteVersion.mutate(selectedVersion);
            }}
          />
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          disabled={!selected || !active || selected.version === active.version}
          onClick={() => setDiffOpen(true)}
        >
          Compare with active
        </Button>
        <Button
          variant="outline"
          disabled={!isAdmin || !selected || selected.version === active?.version}
          onClick={startEdit}
        >
          Edit selected
        </Button>
      </div>

      {isAdmin && (
		  <Dialog open={createOpen} onOpenChange={setCreateOpen}>
			<DialogTrigger asChild>
				<Button variant="outline">Create new version</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>New prompt version</DialogTitle>
				</DialogHeader>
				<div className="space-y-3">
					<Textarea rows={8} placeholder="Enter new system prompt..." value={newPrompt} onChange={(e) => setNewPrompt(e.target.value)} />
					<Input placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
					<div className="space-y-2">
						<div className="text-sm font-medium">Role overrides</div>
						<RoleOverridesEditor value={roleOverrides} onChange={setRoleOverrides} />
            <p className="text-xs text-muted-foreground">Overrides append to the base prompt for users with that role. Use to tailor tone or constraints (e.g., “Support: prefer templates; do not reveal internal ops”).</p>
					</div>
					<label className="text-sm flex items-center gap-2">
						<input type="checkbox" className="accent-current" checked={autoActivate} onChange={(e) => setAutoActivate(e.target.checked)} />
						Auto-activate after create
					</label>
				</div>
				<DialogFooter>
					<Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
					<Button disabled={createVersion.isPending || newPrompt.trim().length === 0} onClick={async () => { await createVersion.mutateAsync(); setCreateOpen(false); }}>
						{createVersion.isPending ? "Saving..." : "Create"}
					</Button>
				</DialogFooter>
			</DialogContent>
		  </Dialog>
      )}

      {/* Diff dialog */}
      <Dialog open={diffOpen} onOpenChange={setDiffOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Compare prompts</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs font-medium mb-1">Active v{active?.version}</div>
              <Textarea readOnly rows={14} value={active?.prompt || ""} />
            </div>
            <div>
              <div className="text-xs font-medium mb-1">Selected v{selected?.version}</div>
              <Textarea readOnly rows={14} value={selected?.prompt || ""} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiffOpen(false)}>Close</Button>
            <ConfirmDialog
              trigger={<Button disabled={!isAdmin || !selected || selected?.version === active?.version}>Activate selected</Button>}
              title="Activate selected version?"
              onConfirm={() => {
                if (selected) activateVersion.mutate(selected.version);
                setDiffOpen(false);
              }}
            />
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit prompt version v{selected?.version}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Textarea rows={8} value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} />
            <Input placeholder="Notes (optional)" value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            <div className="space-y-2">
              <div className="text-sm font-medium">Role overrides</div>
              <RoleOverridesEditor value={editOverrides} onChange={setEditOverrides} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button disabled={updateVersion.isPending || !selected || editPrompt.trim().length === 0} onClick={() => updateVersion.mutate()}>
              {updateVersion.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function RoleOverridesEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: Record<string, string>) => void }) {
  const [roleKey, setRoleKey] = useState("");
  const [text, setText] = useState("");
  const keys = Object.keys(value);
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input placeholder="role key (e.g., support)" value={roleKey} onChange={(e) => setRoleKey(e.target.value)} className="w-52" />
        <Input placeholder="extra instructions" value={text} onChange={(e) => setText(e.target.value)} className="flex-1" />
        <Button
          variant="outline"
          onClick={() => {
            const rk = roleKey.trim();
            if (!rk || !text.trim()) return;
            onChange({ ...value, [rk]: text });
            setRoleKey("");
            setText("");
          }}
        >Add</Button>
      </div>
      {keys.length > 0 && (
        <div className="space-y-1">
          {keys.map((k) => (
            <div key={k} className="flex items-center gap-2 text-sm">
              <Badge variant="secondary" className="w-40 justify-between"><span>{k}</span></Badge>
              <span className="text-muted-foreground truncate">{value[k]}</span>
              <Button size="sm" variant="ghost" onClick={() => {
                const rest = { ...value };
                delete rest[k];
                onChange(rest);
              }}>Remove</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}


