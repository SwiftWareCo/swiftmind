"use client";

import { Markdown } from "@/components/chat/Markdown";
import { CopyButton } from "@/components/chat/MessageActions";

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  displayName?: string | null;
  avatarUrl?: string | null;
  citations?: { index: number; doc_id: string; chunk_idx: number; title: string | null; source_uri?: string | null }[];
};

export function MessageList({ messages, onCitationClick }: { messages: ChatMessage[]; onCitationClick?: (index: number) => void }) {
  return (
    <div className="space-y-4">
      {messages.map((m) => (
        <div key={m.id} className="rounded-xl border p-3 sm:p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
            <div className="h-6 w-6 rounded-full bg-muted" />
            <div className="truncate max-w-[200px]">{m.displayName || (m.role === "user" ? "You" : "Assistant")}</div>
            <div className="ml-auto">{new Date(m.createdAt).toLocaleTimeString()}</div>
          </div>
          <div className="text-sm">
            {m.role === "assistant" ? <Markdown text={m.text} /> : <p className="whitespace-pre-wrap">{m.text}</p>}
          </div>
          {m.role === "assistant" && (
            <div className="mt-2 flex items-center gap-2">
              <CopyButton text={m.text} />
            </div>
          )}
          {m.role === "assistant" && (m.citations?.length || 0) > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              {(m.citations || []).map((c) => (
                <button
                  key={`${c.doc_id}_${c.chunk_idx}`}
                  className="mr-2 align-super underline"
                  onClick={() => onCitationClick?.(c.index)}
                >
                  [{c.index + 1}]
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


