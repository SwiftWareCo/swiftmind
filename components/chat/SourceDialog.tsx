"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createClient } from "@/server/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { CopyButton } from "@/components/chat/MessageActions";
import { toast } from "sonner";

type Citation = {
  doc_id: string;
  chunk_idx: number;
  title: string | null;
  source_uri?: string | null;
  snippet?: string | null;
  score?: number | null;
};

type Props = {
  citation: Citation;
  index: number;
  highlightTerms?: string[];
  children: React.ReactNode;
};

export function SourceDialog({ citation, index, highlightTerms = [], children }: Props) {
  const [open, setOpen] = useState(false);
  const [currentIdx, setCurrentIdx] = useState<number>(citation.chunk_idx);
  const lastGoodIdx = useRef<number>(citation.chunk_idx);
  const supabase = createClient();

  const { data, isLoading, isError, refetch } = useQuery<{ content: string } | null, Error>({
    enabled: open,
    queryKey: ["kb-chunk", citation.doc_id, currentIdx],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("kb_chunks")
        .select("content")
        .eq("doc_id", citation.doc_id)
        .eq("chunk_idx", currentIdx)
        .limit(1)
        .maybeSingle<{ content: string }>();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
  });

  // Track last successful chunk index
  useEffect(() => {
    if (data?.content) {
      lastGoodIdx.current = currentIdx;
    } else if (!isLoading && !isError && currentIdx !== lastGoodIdx.current) {
      // Revert when next/prev points to a non-existent chunk
      toast.message("No further chunks", { description: "This document has no more adjacent chunks." });
      setCurrentIdx(lastGoodIdx.current);
    }
  }, [data?.content, isLoading, isError, currentIdx]);

  // Highlight occurrences of query terms (case-insensitive)
  const highlighted = useMemo(() => {
    const text = data?.content || citation.snippet || "";
    if (!text || highlightTerms.length === 0) return text;
    try {
      const escaped = highlightTerms
        .filter((t) => t && t.length >= 3)
        .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
      if (escaped.length === 0) return text;
      const re = new RegExp(`(${escaped.join("|")})`, "gi");
      const parts = text.split(re);
      return parts.map((part, i) =>
        re.test(part) ? (
          <mark key={i} className="bg-purple-200 text-red-900 font-bold">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      );
    } catch {
      return text;
    }
  }, [data?.content, citation.snippet, highlightTerms]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>
            Source [{index + 1}]: {citation.title || "Untitled"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex items-center justify-between px-1 pb-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {citation.score && (
              <div>
                Relevance: {Math.round(citation.score * 100)}%
              </div>
            )}
            <div className="hidden sm:block">Chunk #{currentIdx}</div>
          </div>
          <CopyButton text={typeof data?.content === "string" ? data!.content : (citation.snippet || "")} />
        </div>
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            <div className="text-sm whitespace-pre-wrap">
              {isLoading && "Loading full source..."}
              {isError && (
                <div>
                  <div className="text-destructive">Failed to load source.</div>
                  {citation.snippet && (
                    <div className="mt-2">
                      <div className="text-muted-foreground">Preview:</div>
                      <div>{citation.snippet}</div>
                    </div>
                  )}
                  <button className="mt-2 underline" onClick={() => refetch()}>Retry</button>
                </div>
              )}
              {!isLoading && !isError && (
                data?.content
                  ? highlighted
                  : (
                    currentIdx === citation.chunk_idx
                      ? (citation.snippet || "")
                      : <span className="text-muted-foreground">Chunk not found.</span>
                  )
              )}
            </div>
            {citation.source_uri && (
              <div className="pt-2 border-t">
                <a
                  href={citation.source_uri || undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 underline hover:text-blue-800"
                >
                  Open source document
                </a>
              </div>
            )}
            <div className="flex items-center justify-between pt-2 border-t">
              <button
                className="text-xs underline disabled:opacity-50 hover:cursor-pointer "
                onClick={() => setCurrentIdx((v) => Math.max(0, v - 1))}
                disabled={currentIdx <= 0}
              >
                Previous chunk
              </button>
              <button
                className="text-xs underline hover:cursor-pointer "
                onClick={() => setCurrentIdx((v) => v + 1)}
              >
                Next chunk
              </button>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
