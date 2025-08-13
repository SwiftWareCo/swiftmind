"use client";

import { useCallback, useMemo, useState } from "react";
import { MessageList, type ChatMessage } from "@/components/chat/MessageList";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { SourcesPanel, type CitationItem } from "@/components/chat/SourcesPanel";
import { toast } from "sonner";
import { TypingDots } from "@/components/chat/TypingDots";

export type AskResult = { ok: true; text: string; citations: { doc_id: string; chunk_idx: number; title: string | null; source_uri?: string | null; snippet?: string | null; score?: number | null }[] } | { ok: false; error: string };

export function ChatRoot({ currentUser, ask }: { currentUser: { displayName: string | null; avatarUrl: string | null }; ask: (question: string) => Promise<AskResult> }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<CitationItem[]>([]);
  const [pending, setPending] = useState(false);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);

  const onSend = useCallback(async (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text, createdAt: Date.now(), displayName: currentUser.displayName || "You", avatarUrl: currentUser.avatarUrl },
    ]);
    setPending(true);
    setLastQuestion(text);
    try {
      const json = await ask(text);
      if (!json.ok) throw new Error(json.error);
      const idxMap = new Map<string, number>();
      const items: CitationItem[] = (json.citations || []).map((c, i) => {
        idxMap.set(`${c.doc_id}_${c.chunk_idx}`, i);
        return { index: i, title: c.title, snippet: c.snippet || null, score: c.score ?? null, source_uri: c.source_uri || undefined };
      });
      setCitations(items);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: json.text,
          createdAt: Date.now(),
          citations: (json.citations || []).map((c) => ({ index: idxMap.get(`${c.doc_id}_${c.chunk_idx}`) || 0, ...c })),
        },
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  }, [ask, currentUser.displayName, currentUser.avatarUrl]);

  const empty = useMemo(() => messages.length === 0, [messages.length]);

  const onRegenerate = useCallback(async () => {
    if (!lastQuestion) return;
    await onSend(lastQuestion);
  }, [lastQuestion, onSend]);

  return (
    <div className="relative grid gap-4 h-full md:grid-cols-[1fr_320px] pb-24">
      <div className="flex min-h-[70dvh] flex-col">
        <div className="flex-1" role="log" aria-live="polite" aria-relevant="additions">
          {empty ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-sm text-muted-foreground">
                Ask a question to get started. Your answers will be grounded with citations.
              </div>
            </div>
          ) : (
            <>
              <MessageList
                messages={messages}
                onCitationClick={(i) => {
                  const el = document.getElementById(`src-${i + 1}`);
                  if (!el) return;
                  el.scrollIntoView({ behavior: "smooth", block: "start" });
                  el.classList.add("ring-2", "ring-primary/60", "bg-muted/30");
                  setTimeout(() => el.classList.remove("ring-2", "ring-primary/60", "bg-muted/30"), 1200);
                }}
              />
              {pending && (
                <div className="mt-4 rounded-xl border p-3 sm:p-4">
                  <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <div className="h-6 w-6 rounded-full bg-muted" />
                    <div className="truncate max-w-[200px]">Assistant</div>
                  </div>
                  <TypingDots />
                </div>
              )}
            </>
          )}
        </div>
        {/* Fixed composer at viewport bottom */}
        <div className="fixed bottom-0 left-0 right-0 md:left-[240px] z-40 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto max-w-8xl px-4 sm:px-6 md:px-8 py-2">
            <ChatComposer onSend={onSend} onRegenerate={messages.length > 0 ? onRegenerate : undefined} isPending={pending} />
          </div>
        </div>
      </div>
      <aside className="hidden md:block">
        <SourcesPanel items={citations} />
      </aside>
    </div>
  );
}


