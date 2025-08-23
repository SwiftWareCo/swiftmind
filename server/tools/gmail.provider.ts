import "server-only";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getGoogleAccessToken } from "@/server/integrations/tokenManager";
import type { TablesInsert } from "@/lib/types/database.types";
import { createClient } from "@/server/supabase/server";
import { checkRateLimit, limiterKey } from "@/lib/utils/rateLimit";
import { extractHeader, toCleanTextFromMessageParts } from "./gmail.parse";

const DEBUG = (process.env.EMAIL_TOOL_DEBUG || "").toLowerCase() === "true";

export type GmailSearchArgs = {
  tenantId: string;
  query: string;
  labelIds?: string[];
  max?: number;
  after?: string;
  before?: string;
  ttlSec?: number;
};

export type GmailSearchItem = {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate: number;
  subject: string;
  from: string;
  to: string;
  snippet: string;
  labelIds: string[];
};

export type GmailGetMessageArgs = { tenantId: string; id: string; format?: "text" };
export type GmailMessage = {
  text: string;
  headers: { subject: string; from: string; to: string; date: string };
  threadId: string;
};

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";

// In-memory cache for search results (headers/snippets only)
const searchCache = new Map<string, { expiresAt: number; items: GmailSearchItem[] }>();

function cacheKeySearch(args: GmailSearchArgs): string {
  const { tenantId, query, labelIds, after, before, max } = args;
  return JSON.stringify({ tenantId, query, labelIds: labelIds || [], after: after || null, before: before || null, max: max || 10 });
}

async function audit(tenantId: string, meta: Record<string, unknown>): Promise<void> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("audit_logs").insert({
      tenant_id: tenantId,
      actor_user_id: user.id,
      action: "mcp.invoke",
      resource: "gmail",
      meta,
    } as unknown as TablesInsert<"audit_logs">);
  } catch {}
}

type ErrorResult = { ok: false; error: { code: string; message?: string; needsReconnect?: boolean } };

export async function search(args: GmailSearchArgs): Promise<{ ok: true; items: GmailSearchItem[] } | ErrorResult> {
  const { tenantId } = args;
  
  if (DEBUG) console.log("gmail.search: starting", { 
    tenantId, 
    originalArgs: {
      query: args.query,
      labelIds: args.labelIds,
      max: args.max,
      after: args.after,
      before: args.before
    }
  });
  try {
    await requirePermission(tenantId, "email.read");
  } catch (e) {
    if (DEBUG) console.log("gmail.search: permission_error", { tenantId });
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: msg === "403" ? "forbidden" : msg === "401" ? "unauthorized" : "upstream_error" } };
  }

  // Rate limit: 60/min per tenant for Gmail tools combined
  const rlKey = limiterKey([tenantId, "gmail", "search"]);
  const rl = checkRateLimit(rlKey, 60, 60_000);
  if (!rl.ok) return { ok: false, error: { code: "rate_limited" } };

  const tokens = await getGoogleAccessToken(tenantId);
  if (!tokens.ok) {
    if (DEBUG) console.log("gmail.search: token_error", { error: tokens.error, needsReconnect: tokens.needsReconnect });
    return { ok: false, error: { code: tokens.needsReconnect ? "needs_reconnect" : "upstream_error", needsReconnect: tokens.needsReconnect } };
  }

  const ttlSec = Number(args.ttlSec ?? process.env.EMAIL_TOOL_CACHE_TTL_SEC ?? 180);
  const key = cacheKeySearch(args);
  const cached = searchCache.get(key);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    if (DEBUG) console.log("gmail.search: cache_hit", { key, count: cached.items.length });
    await audit(tenantId, { provider: "gmail", tool: "search", cache: true, queryOrId: args.query, resultCount: cached.items.length });
    return { ok: true, items: cached.items } as const;
  }

  const qParts: string[] = [args.query || ""];
  if (args.after) qParts.push(`after:${args.after}`);
  if (args.before) qParts.push(`before:${args.before}`);
  const q = qParts.filter(Boolean).join(" ");

  if (DEBUG) console.log("gmail.search: building_query", { 
    originalQuery: args.query,
    qParts,
    finalQuery: q,
    labelIds: args.labelIds
  });

  const url = new URL(`${GMAIL_API}/users/me/messages`);
  if ((q || "").trim().length > 0) url.searchParams.set("q", q);
  if (args.labelIds && args.labelIds.length > 0) {
    for (const labelId of args.labelIds) {
      url.searchParams.append("labelIds", labelId);
    }
  }
  url.searchParams.set("maxResults", String(Math.max(1, Math.min(args.max ?? 10, 25))));

  if (DEBUG) console.log("gmail.search: api_call", { 
    url: url.toString(),
    headers: { Authorization: `Bearer ${tokens.accessToken.slice(0, 20)}...` }
  });

  let listJson: { messages?: Array<{ id: string; threadId: string }>; error?: { status?: string } } | undefined;
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
    });
    const text = await res.text();
    
    if (DEBUG) console.log("gmail.search: api_response", { 
      status: res.status,
      ok: res.ok,
      bodyLength: text?.length || 0,
      bodyPreview: text?.slice(0, 500)
    });

    listJson = (text ? JSON.parse(text) : {}) as { messages?: Array<{ id: string; threadId: string }>; error?: { status?: string } };
    if (!res.ok) {
      const code = (listJson?.error?.status as string) || `http_${res.status}`;
      if (DEBUG) console.log("gmail.search: http_error", { code, status: res.status, body: text?.slice(0, 200), fullError: listJson?.error });
      return { ok: false, error: { code: "upstream_error", message: code } };
    }
  } catch {
    if (DEBUG) console.log("gmail.search: network_error");
    return { ok: false, error: { code: "upstream_error" } };
  }

  const messages: Array<{ id: string; threadId: string }> = listJson.messages || [];
  if (DEBUG) console.log("gmail.search: messages_found", { 
    count: messages.length,
    messageIds: messages.slice(0, 5).map(m => m.id),
    query: q,
    labelIds: args.labelIds
  });

  if (messages.length === 0) {
    if (DEBUG) console.log("gmail.search: zero_results", { 
      query: q,
      originalQuery: args.query,
      labelIds: args.labelIds,
      maxResults: Math.max(1, Math.min(args.max ?? 10, 25)),
      fullResponse: listJson
    });
    await audit(tenantId, { provider: "gmail", tool: "search", queryOrId: args.query, resultCount: 0 });
    return { ok: true, items: [] } as const;
  }

  // Fetch minimal metadata for each id (batch via fields projection)
  const items: GmailSearchItem[] = [];
  for (const m of messages) {
    const mUrl = new URL(`${GMAIL_API}/users/me/messages/${encodeURIComponent(m.id)}`);
    mUrl.searchParams.set("format", "metadata");
    mUrl.searchParams.set("metadataHeaders", "subject");
    mUrl.searchParams.append("metadataHeaders", "from");
    mUrl.searchParams.append("metadataHeaders", "to");
    try {
      const res = await fetch(mUrl.toString(), { headers: { Authorization: `Bearer ${tokens.accessToken}` }, cache: "no-store" });
      const mj = await res.json();
      if (!res.ok) continue;
      const headers = Array.isArray(mj.payload?.headers) ? mj.payload.headers : [];
      const subject = extractHeader(headers, "Subject");
      const from = extractHeader(headers, "From");
      const to = extractHeader(headers, "To");
      const normalized: GmailSearchItem = {
        id: mj.id,
        threadId: mj.threadId,
        historyId: mj.historyId,
        internalDate: Number(mj.internalDate || 0),
        subject,
        from,
        to,
        snippet: mj.snippet || "",
        labelIds: Array.isArray(mj.labelIds) ? mj.labelIds : [],
      };
      items.push(normalized);
    } catch {
      // skip
    }
  }

  searchCache.set(key, { expiresAt: now + ttlSec * 1000, items });
  if (DEBUG) console.log("gmail.search: success", { count: items.length });
  await audit(tenantId, { provider: "gmail", tool: "search", queryOrId: args.query, resultCount: items.length });
  return { ok: true, items } as const;
}

export async function getMessage(args: GmailGetMessageArgs): Promise<{ ok: true; message: GmailMessage } | ErrorResult> {
  const { tenantId, id } = args;
  try {
    await requirePermission(tenantId, "email.read");
  } catch (e) {
    if (DEBUG) console.log("gmail.getMessage: permission_error", { tenantId });
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: msg === "403" ? "forbidden" : msg === "401" ? "unauthorized" : "upstream_error" } };
  }

  const rlKey = limiterKey([tenantId, "gmail", "getMessage"]);
  const rl = checkRateLimit(rlKey, 60, 60_000);
  if (!rl.ok) return { ok: false, error: { code: "rate_limited" } };

  const tokens = await getGoogleAccessToken(tenantId);
  if (!tokens.ok) {
    if (DEBUG) console.log("gmail.getMessage: token_error", { error: tokens.error, needsReconnect: tokens.needsReconnect });
    return { ok: false, error: { code: tokens.needsReconnect ? "needs_reconnect" : "upstream_error", needsReconnect: tokens.needsReconnect } };
  }

  const url = new URL(`${GMAIL_API}/users/me/messages/${encodeURIComponent(id)}`);
  url.searchParams.set("format", "full");

  let mj: { id?: string; threadId?: string; historyId?: string; internalDate?: string | number; snippet?: string; labelIds?: string[]; payload?: { headers?: Array<{ name?: string; value?: string }>; parts?: unknown } } | undefined;
  try {
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
      cache: "no-store",
    });
    const text = await res.text();
    mj = (text ? JSON.parse(text) : {}) as { id?: string; threadId?: string; historyId?: string; internalDate?: string | number; snippet?: string; labelIds?: string[]; payload?: { headers?: Array<{ name?: string; value?: string }>; parts?: unknown } };
    if (!res.ok) {
      // Gmail errors may be in the body under error.status; cast loosely
      const errObj = (text ? JSON.parse(text) : {}) as { error?: { status?: string } };
      const code = (errObj?.error?.status as string) || `http_${res.status}`;
      if (DEBUG) console.log("gmail.getMessage: http_error", { code, status: res.status });
      return { ok: false, error: { code: code === "NOT_FOUND" ? "not_found" : "upstream_error", message: code } };
    }
  } catch {
    if (DEBUG) console.log("gmail.getMessage: network_error");
    return { ok: false, error: { code: "upstream_error" } };
  }

  const headers = Array.isArray(mj.payload?.headers) ? mj.payload.headers : [];
  const subject = extractHeader(headers, "Subject");
  const from = extractHeader(headers, "From");
  const to = extractHeader(headers, "To");
  const date = extractHeader(headers, "Date");
  const text = toCleanTextFromMessageParts([mj.payload]);

  await audit(tenantId, { provider: "gmail", tool: "getMessage", queryOrId: id, resultCount: 1 });
  if (DEBUG) console.log("gmail.getMessage: success", { id });

  return {
    ok: true,
    message: {
      text,
      headers: { subject, from, to, date },
      threadId: mj.threadId || "",
    },
  } as const;
}


