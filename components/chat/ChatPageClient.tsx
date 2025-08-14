"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/server/supabase/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SessionTabs } from "@/components/chat/SessionTabs";
import { ChatRoot, type AskResult } from "@/components/chat/ChatRoot";
import type { ChatMessage } from "@/components/chat/MessageList";

type MessageRow = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  citations: unknown;
  created_at: string;
  author_user_id: string | null;
};
type Citation = { doc_id: string; chunk_idx: number; title: string | null; source_uri?: string | null };

type Props = {
  tenantId: string;
  currentUser: { displayName: string | null; avatarUrl: string | null };
  ask: (sessionId: string, question: string) => Promise<AskResult>;
};

export function ChatPageClient({ tenantId, currentUser, ask }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const qc = useQueryClient();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const { data: sessions } = useQuery<{ id: string; title: string; last_message_at: string }[], Error>({
    queryKey: ["chat-sessions", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_sessions")
        .select("id, title, last_message_at")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null)
        .order("last_message_at", { ascending: false });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  useEffect(() => {
    if (!activeSessionId) {
      if ((sessions || []).length > 0) {
        setActiveSessionId(sessions![0].id);
      }
    } else {
      // Ensure active still exists after deletion
      const exists = (sessions || []).some((s) => s.id === activeSessionId);
      if (!exists && (sessions || []).length > 0) {
        setActiveSessionId(sessions![0].id);
      }
      if (!exists && (sessions || []).length === 0) {
        setActiveSessionId(null);
      }
    }
  }, [sessions, activeSessionId]);

  const { data: messageRows } = useQuery<Array<MessageRow>, Error>({
    enabled: Boolean(activeSessionId),
    queryKey: ["chat-messages", activeSessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id, role, content, citations, created_at, author_user_id")
        .eq("session_id", activeSessionId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return data || [];
    },
  });

  const initialMessages: ChatMessage[] = useMemo(() => {
    const rows = messageRows || [];
    return rows
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({
        id: r.id,
        role: r.role as "user" | "assistant",
        text: r.content,
        createdAt: new Date(r.created_at).getTime(),
        displayName: r.role === "user" ? (currentUser.displayName || "You") : "Assistant",
        avatarUrl: r.role === "user" ? currentUser.avatarUrl : undefined,
        citations: r.role === "assistant" && Array.isArray(r.citations)
          ? (r.citations as Citation[]).map((c, i) => ({ index: i, ...c }))
          : undefined,
      }));
  }, [messageRows, currentUser.avatarUrl, currentUser.displayName]);

  const initialCitations = useMemo(() => {
    const rows = messageRows || [];
    const lastAssistant = [...rows].reverse().find((r) => r.role === "assistant");
    if (!lastAssistant || !Array.isArray(lastAssistant.citations)) return [] as Array<{ index: number; title: string | null; snippet?: string | null; score?: number | null; source_uri?: string | null }>;
    const list = (lastAssistant.citations as Array<{
      doc_id: string; chunk_idx: number; title: string | null; source_uri?: string | null; snippet?: string | null; score?: number | null;
    }>);
    return list.map((c, i) => ({ index: i, title: c.title, snippet: c.snippet ?? null, score: c.score ?? null, source_uri: c.source_uri ?? undefined }));
  }, [messageRows]);

  const createSessionMutation = useMutation<{ id: string }, Error, void>({
    mutationFn: async () => {
      const { data: userRes, error: userErr } = await supabase.auth.getUser();
      if (userErr) throw new Error(userErr.message);
      const userId = userRes.user?.id;
      if (!userId) throw new Error("Not authenticated");
      const { data, error } = await supabase
        .from("chat_sessions")
        .insert({ tenant_id: tenantId, created_by: userId })
        .select("id")
        .single<{ id: string }>();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ["chat-sessions", tenantId] });
      setActiveSessionId(res.id);
    },
  });

  const askForSession = useMemo(() => (
    async (sid: string, q: string) => {
      const result = await ask(sid, q);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["chat-sessions", tenantId] }),
        qc.invalidateQueries({ queryKey: ["chat-messages", sid] }),
      ]);
      return result;
    }
  ), [ask, qc, tenantId]);


  return (
    <div className="container mx-auto max-w-8xl">
      <SessionTabs
        tenantId={tenantId}
        activeSessionId={activeSessionId}
        onSelect={setActiveSessionId}
        onCreate={(id) => setActiveSessionId(id)}
        onSoftDelete={async (id) => {
          const { error } = await supabase.rpc("hard_delete_chat_session", { t: tenantId, s: id });
          if (error) throw new Error(error.message);
        }}
      />
      <h1 className="mb-4 text-2xl font-semibold">Chat</h1>
      <ChatRoot
        key={activeSessionId || "none"}
        currentUser={currentUser}
        sessionId={activeSessionId}
        ensureSession={async () => {
          if (activeSessionId) return activeSessionId;
          const res = await createSessionMutation.mutateAsync();
          await qc.invalidateQueries({ queryKey: ["chat-sessions", tenantId] });
          setActiveSessionId(res.id);
          return res.id;
        }}
        askForSession={askForSession}
        initialMessages={initialMessages}
        initialCitations={initialCitations}
      />
    </div>
  );
}


