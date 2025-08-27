"use client";

import { useState } from "react";
import { SourceDialog } from "@/components/chat/SourceDialog";

export type CitationItem = {
  index: number;
  doc_id: string;
  chunk_idx: number;
  title: string | null;
  snippet?: string | null;
  score?: number | null;
  source_uri?: string | null;
  used?: boolean;
};

export function SourcesPanel({ items, queryTerms = [] }: { items: CitationItem[]; queryTerms?: string[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="md:sticky md:top-16 md:max-h-[calc(100vh-5rem)]">
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
        <div className="rounded-xl border p-3 md:max-h-[calc(100vh-8rem)] md:flex md:flex-col">
          <div className="mb-2 text-sm font-medium flex-shrink-0">
            Sources {items.length > 0 && <span className="text-muted-foreground">({items.length})</span>}
          </div>
          <div className="space-y-3 md:overflow-y-auto md:flex-1 md:min-h-0 md:pr-2 scrollbar-thin">
            {items.length === 0 && <div className="text-sm text-muted-foreground">No sources</div>}
            {items.map((it) => (
              <div key={it.index} id={`src-${it.index + 1}`} className="rounded-md border p-2 scroll-mt-4">
                <div className="flex items-center justify-between text-xs">
                  <SourceDialog
                    citation={{
                      doc_id: it.doc_id,
                      chunk_idx: it.chunk_idx,
                      title: it.title,
                      source_uri: it.source_uri,
                      snippet: it.snippet,
                      score: it.score ?? null,
                    }}
                    index={it.index}
                    highlightTerms={queryTerms}
                  >
                    <button className="font-medium underline hover:cursor-pointer hover:text-blue-500">[{it.index + 1}] {it.title || "Untitled"}</button>
                  </SourceDialog>
                  <div className="flex items-center gap-2">
                    {typeof it.score === "number" && (
                      <div className="text-muted-foreground" title="Relative relevance among returned sources">
                        {Math.round(it.score * 100)}%
                      </div>
                    )}
                    {it.used && (
                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground" title="Was this chunk included in the model context?">
                        Used in answer
                      </span>
                    )}
                  </div>
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


