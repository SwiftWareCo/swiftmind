"use client";

import { useState } from "react";

export type CitationItem = {
  index: number;
  title: string | null;
  snippet?: string | null;
  score?: number | null;
  source_uri?: string | null;
};

export function SourcesPanel({ items }: { items: CitationItem[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="md:sticky md:top-16">
      <div className="mb-2 flex items-center justify-between md:hidden">
        <button
          className="text-sm underline"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "Hide sources" : "Show sources"}
        </button>
      </div>
      <div className={open ? "block" : "hidden md:block"}>
        <div className="rounded-xl border p-3">
          <div className="mb-2 text-sm font-medium">Sources</div>
          <div className="space-y-3">
            {items.length === 0 && <div className="text-sm text-muted-foreground">No sources</div>}
            {items.map((it) => (
              <div key={it.index} id={`src-${it.index + 1}`} className="rounded-md border p-2 scroll-mt-4">
                <div className="flex items-center justify-between text-xs">
                  <div className="font-medium">[{it.index + 1}] {it.title || "Untitled"}</div>
                  {typeof it.score === "number" && (
                    <div className="text-muted-foreground" title="Relative relevance among returned sources">
                      {Math.round(it.score * 100)}%
                    </div>
                  )}
                </div>
                {it.snippet && <ExpandableSnippet snippet={it.snippet} />}
                {it.source_uri && (
                  <div className="mt-2">
                    <a href={it.source_uri} target="_blank" rel="noreferrer" className="text-xs underline">Open source</a>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ExpandableSnippet({ snippet }: { snippet: string }) {
  const [expanded, setExpanded] = useState(false);
  const MAX = expanded ? 3000 : 600;
  const shown = snippet.slice(0, MAX);
  const isTruncated = snippet.length > MAX;
  return (
    <div className="mt-1 text-xs text-muted-foreground whitespace-pre-wrap">
      {shown}
      {isTruncated && (
        <button className="ml-1 underline" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </div>
  );
}


