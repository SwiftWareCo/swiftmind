"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageList, type ChatMessage } from "@/components/chat/MessageList";
import { ChatComposer } from "@/components/chat/ChatComposer";
import { SourcesPanel, type CitationItem } from "@/components/chat/SourcesPanel";
import { toast } from "sonner";
import { TypingDots } from "@/components/chat/TypingDots";
import { ScrollArea } from "@/components/ui/scroll-area";

export type AskResult = { ok: true; text: string; citations: { doc_id: string; chunk_idx: number; title: string | null; source_uri?: string | null; snippet?: string | null; score?: number | null }[] } | { ok: false; error: string };

export function ChatRoot({
  currentUser,
  sessionId,
  ensureSession,
  askForSession,
  initialMessages = [],
  initialCitations = [],
}: {
  currentUser: { displayName: string | null; avatarUrl: string | null };
  sessionId: string | null;
  ensureSession: () => Promise<string>;
  askForSession: (sessionId: string, question: string) => Promise<AskResult>;
  initialMessages?: ChatMessage[];
  initialCitations?: CitationItem[];
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [citations, setCitations] = useState<CitationItem[]>(initialCitations);
  const [pending, setPending] = useState(false);
  // Keeping local input state only; no regenerate feature
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Reset messages only when switching sessions
    setMessages(initialMessages);
    setCitations(initialCitations);
  }, [sessionId, initialMessages, initialCitations]);

  const onSend = useCallback(async (text: string) => {
    setPending(true);
    try {
      const sid = sessionId || (await ensureSession());
      // For new sessions, don't show user message until after session creation
      if (sessionId) {
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "user", text, createdAt: Date.now(), displayName: currentUser.displayName || "You", avatarUrl: currentUser.avatarUrl },
        ]);
      }
      const json = await askForSession(sid, text);
      if (!json.ok) throw new Error(json.error);
      const idxMap = new Map<string, number>();
      const items: CitationItem[] = (json.citations || []).map((c, i) => {
        idxMap.set(`${c.doc_id}_${c.chunk_idx}`, i);
        return { index: i, title: c.title, snippet: c.snippet || null, score: c.score ?? null, source_uri: c.source_uri || undefined };
      });
      setCitations(items);
      // Don't add messages manually here - let TanStack Query refresh handle it
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      toast.error(msg);
    } finally {
      setPending(false);
    }
  }, [askForSession, ensureSession, sessionId, currentUser.displayName, currentUser.avatarUrl]);

  const empty = useMemo(() => messages.length === 0, [messages.length]);


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, pending]);

  return (
    <div className="relative grid gap-4 h-full md:grid-cols-[1fr_320px]">
      <div className="flex min-h-[70dvh] flex-col">
        <div className="flex-1" role="log" aria-live="polite" aria-relevant="additions">
          {empty ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center text-sm text-muted-foreground">
                Ask a question to get started. Your answers will be grounded with citations.
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-[1fr] gap-4">
              <ScrollArea className="max-h-[70dvh] pr-2">
                <div className="space-y-4 p-4">
                  <MessageList messages={messages} />
                  {pending && (
                    <div className=" rounded-xl border p-3 sm:p-4">
                      <div className=" flex items-center gap-2 text-xs text-muted-foreground">
                        <div className="h-6 w-6 rounded-full bg-muted" />
                        <div className="truncate max-w-[200px]">Assistant</div>
                      </div>
                      <TypingDots />
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>
            </div>
          )}
        </div>
        {/* Fixed composer at viewport bottom */}
        <div className="fixed bottom-0 left-0 right-0 md:left-[240px] z-40 border-t bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container mx-auto max-w-8xl px-4 sm:px-6 md:px-8 py-2">
            <ChatComposer onSend={onSend} isPending={pending} />
          </div>
        </div>
      </div>
      <aside className="hidden md:block">
        <ScrollArea className="max-h-[70dvh]">
          <SourcesPanel items={citations} />
        </ScrollArea>
      </aside>
    </div>
  );
}


