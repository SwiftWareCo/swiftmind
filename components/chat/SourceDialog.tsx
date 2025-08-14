"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  children: React.ReactNode;
};

export function SourceDialog({ citation, index, children }: Props) {
  const [open, setOpen] = useState(false);

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
        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-4">
            {citation.score && (
              <div className="text-sm text-muted-foreground">
                Relevance: {Math.round(citation.score * 100)}%
              </div>
            )}
            {citation.snippet && (
              <div className="text-sm whitespace-pre-wrap">
                {citation.snippet}
              </div>
            )}
            {citation.source_uri && (
              <div className="pt-2 border-t">
                <a
                  href={citation.source_uri}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-blue-600 underline hover:text-blue-800"
                >
                  Open source document
                </a>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
