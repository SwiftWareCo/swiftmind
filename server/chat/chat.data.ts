"use server";

import "server-only";

import { createClient } from "@/server/supabase/server";

export type ChatSession = {
  id: string;
  tenant_id: string;
  created_by: string;
  title: string;
  last_message_at: string;
  created_at: string;
  updated_at: string;
};

export type ChatMessageRow = {
  id: string;
  tenant_id: string;
  session_id: string;
  author_user_id: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  citations: unknown;
  created_at: string;
};

export async function listSessions(tenantId: string, limit = 50, offset = 0): Promise<ChatSession[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_sessions")
    .select("id, tenant_id, created_by, title, last_message_at, created_at, updated_at")
    .eq("tenant_id", tenantId)
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(error.message);
  return (data || []) as unknown as ChatSession[];
}

export async function getMessages(sessionId: string, limit = 200, after?: string): Promise<ChatMessageRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("chat_messages")
    .select("id, tenant_id, session_id, author_user_id, role, content, citations, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (after) {
    // Supabase doesn't support cursor directly; filter by created_at > after
    query = query.gt("created_at", after);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data || []) as unknown as ChatMessageRow[];
}

export async function getRecentMessagesForContext(sessionId: string, maxMessages = 6): Promise<ChatMessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, tenant_id, session_id, author_user_id, role, content, citations, created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: false })
    .limit(maxMessages);
  if (error) throw new Error(error.message);
  const rows = (data || []) as unknown as ChatMessageRow[];
  return rows.reverse();
}


