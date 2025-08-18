"use client";

import { useActionState, useEffect, useState } from "react";
import { uploadAndIngest } from "@/server/kb/kb.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MultiSelect } from "@/components/ui/multi-select";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { kbDocsKeys } from "@/lib/queryOptions/kbQueryOptions";

type Props = { tenantId: string; embedded?: boolean };
type ActionState = { ok: boolean; error?: string };
const initial: ActionState = { ok: false };

const DEFAULT_ROLES = ["support", "operations", "admin"] as const;

export function UploadForm({ tenantId, embedded = false }: Props) {
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
      // Ensure list refreshes even on ingest error states
      queryClient.invalidateQueries({ queryKey: kbDocsKeys.list(tenantId) });
    }
  }, [state, queryClient, tenantId]);

  const roleOptions = DEFAULT_ROLES.map((r) => ({ label: r, value: r }));

  const formEl = (
    <form
      action={(fd) => {
        selectedRoles.forEach((r) => fd.append("allowed_roles", r));
        formAction(fd);
      }}
      className="flex flex-col gap-3 md:flex-row md:items-center"
    >
      <Input name="file" type="file" accept=".pdf,.md,.markdown,.txt,.html,.htm" required className="md:max-w-sm" />
      <div className="min-w-[240px]">
        <MultiSelect
          options={roleOptions}
          placeholder="Allowed roles"
          defaultValue={selectedRoles}
          onValueChange={setSelectedRoles}
          responsive
          className="w-full"
          maxWidth="320px"
          singleLine
        />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Uploading..." : "Upload & Ingest"}
      </Button>
    </form>
  );

  if (embedded) {
    return (
      <div className="rounded-md border p-3">{formEl}<p className="mt-1 text-xs text-muted-foreground">Max 20MB. Supported: PDF, Markdown, HTML, TXT.</p></div>
    );
  }

  return (
    <Card className="mt-4">
      <CardHeader className="py-4">
        <CardTitle>Upload document</CardTitle>
        <CardDescription>Select a file and choose which roles can see the resulting snippets.</CardDescription>
      </CardHeader>
      <CardContent className="py-4">
        {formEl}
        <p className="mt-1 text-xs text-muted-foreground">Max 20MB. Supported: PDF, Markdown, HTML, TXT.</p>
      </CardContent>
    </Card>
  );
}


