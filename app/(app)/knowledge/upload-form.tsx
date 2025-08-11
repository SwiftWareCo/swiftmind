"use client";

import { useActionState, useEffect, useState } from "react";
import { uploadAndIngest } from "@/server/kb/kb.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { kbDocsKeys } from "@/lib/queryOptions/kbQueryOptions";

type Props = { tenantId: string };
type ActionState = { ok: boolean; error?: string };
const initial: ActionState = { ok: false };

const DEFAULT_ROLES = ["support", "operations", "admin"] as const;

export function UploadForm({ tenantId }: Props) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(uploadAndIngest, initial);
  const [selectedRoles, setSelectedRoles] = useState<string[]>([...DEFAULT_ROLES]);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Ingest started");
      queryClient.invalidateQueries({ queryKey: kbDocsKeys.list(tenantId) });
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, queryClient, tenantId]);

  return (
    <form
      action={(fd) => {
        selectedRoles.forEach((r) => fd.append("allowed_roles", r));
        formAction(fd);
      }}
      className="mt-6 rounded-md border p-4"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <Input name="file" type="file" accept=".pdf,.md,.markdown,.txt,.html,.htm" required className="md:max-w-sm" />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Allowed roles:</span>
          {DEFAULT_ROLES.map((r) => (
            <label key={r} className="inline-flex items-center gap-1">
              <input
                type="checkbox"
                checked={selectedRoles.includes(r)}
                onChange={(e) => {
                  setSelectedRoles((prev) => (e.target.checked ? [...prev, r] : prev.filter((x) => x !== r)));
                }}
              />
              <span>{r}</span>
            </label>
          ))}
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Uploading..." : "Upload & Ingest"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Max 20MB. Supported: PDF, Markdown, HTML, TXT.</p>
    </form>
  );
}


