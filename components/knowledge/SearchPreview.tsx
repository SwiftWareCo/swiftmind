"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { previewSearch, type PreviewSearchState } from "@/server/kb/kb.actions";

type Props = { tenantId: string };

const initial: PreviewSearchState = { ok: true, results: [] } as const;

export function SearchPreview({}: Props) {
  const [state, formAction, pending] = useActionState<PreviewSearchState, FormData>(previewSearch, initial);
  return (
    <div className="rounded-md border p-3">
      <form action={formAction} className="flex items-center gap-2">
        <Input name="query" placeholder="Search knowledge…" className="flex-1" />
        <input type="hidden" name="k" value="3" />
        <Button type="submit" disabled={pending}>{pending ? "Searching…" : "Search"}</Button>
      </form>
      <div className="mt-3 space-y-3">
        {state && state.ok && state.results.length === 0 && !pending ? (
          <div className="text-sm text-muted-foreground">No matching knowledge yet.</div>
        ) : null}
        {state && state.ok
          ? state.results.map((r, i) => (
              <div key={i} className="rounded-md border p-2">
                <div className="font-medium truncate" title={r.title}>{r.title}</div>
                <div className="mt-1 text-sm text-muted-foreground line-clamp-3">{r.snippet}</div>
                {r.uri ? (
                  <a className="mt-1 inline-block text-xs underline" href={r.uri} target="_blank" rel="noreferrer">
                    View source
                  </a>
                ) : null}
              </div>
            ))
          : null}
        {state && !state.ok ? <div className="text-sm text-red-600">{state.error}</div> : null}
      </div>
    </div>
  );
}


