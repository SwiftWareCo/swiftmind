"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

type Props = {
  formId?: string; // unused after API route switch (kept for compatibility)
  done: boolean;
  sourceId?: string;
};

export function SyncButton({ formId, done, sourceId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [completed, setCompleted] = useState(false);
  const qc = useQueryClient();
  const router = useRouter();

  async function onClick() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/backoffice/rest-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          toast.error(data.error || `Failed (status ${res.status})`);
        } else {
          toast.success(`Fetched ${data.items} items`, { description: `${data.url} → next: ${data.next ?? "done"}` });
          setCompleted(Boolean(data.done));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(msg);
      }
      router.refresh();
      try { await qc.invalidateQueries(); } catch {}
    });
  }

  if (done || completed) {
    return <Button size="sm" disabled>Completed</Button>;
  }

  return (
    <Button size="sm" onClick={onClick} disabled={isPending}>
      {isPending ? "Syncing…" : "Sync batch"}
    </Button>
  );
}


