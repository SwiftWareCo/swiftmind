import "server-only";
import { invoke } from "@/server/tools/toolRouter";
import { getTenantRagSettings } from "@/server/settings/settings.data";
import { hasPermission } from "@/server/permissions/permissions.data";
import { transformNaturalLanguageToGmailQueryAI, buildGmailQueryString } from "@/server/tools/gmail.ai-transformer";

const EMAIL_TERMS = [
  "email",
  "inbox",
  "message",
  "subject",
  "thread",
  "invoice",
  "sla",
  "follow up",
  "reply",
];

export type EmailOrchestratorResult =
  | { ok: true; text: string }
  | { ok: false; error: string };



export function shouldUseEmailTool(question: string, ragLowConfidence: boolean): boolean {
  const q = question.toLowerCase();
  const hasTerm = EMAIL_TERMS.some((t) => q.includes(t));
  return hasTerm || ragLowConfidence;
}



function formatCitation(idx: number, item: { subject: string; from: string; internalDate: number; id?: string }): string {
  const d = new Date(item.internalDate).toISOString().slice(0, 10);
  const subj = item.subject ? `"${item.subject}"` : "(no subject)";
  const from = item.from || "Unknown";
  const gmailLink = item.id ? ` — [Open in Gmail](https://mail.google.com/mail/u/0/#inbox/${item.id})` : "";
  return `[Email ${idx} — ${subj}, ${from}, ${d}${gmailLink}]`;
}

async function synthesizeEmailAnswer(
  question: string, 
  emails: Array<{ text: string; headers: { subject: string; from: string; to: string; date: string }; threadId: string; id: string }>
): Promise<string> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Fallback: just show basic email info
    return emails.map((email, i) => {
      const citation = formatCitation(i + 1, { 
        subject: email.headers.subject, 
        from: email.headers.from, 
        internalDate: Date.parse(email.headers.date || "") || Date.now(),
        id: email.id // Gmail message ID for the link
      });
      const preview = email.text.split(/\s+/).slice(0, 30).join(" ");
      return `${citation}\nContent: ${preview}...`;
    }).join("\n\n");
  }

  // Build context with email details
  const emailContext = emails.map((email, i) => {
    const citation = formatCitation(i + 1, { 
      subject: email.headers.subject, 
      from: email.headers.from, 
      internalDate: Date.parse(email.headers.date || "") || Date.now(),
      id: email.id // Gmail message ID for the link
    });
    // Limit email content to prevent token overflow
    const content = email.text.split(/\s+/).slice(0, 300).join(" ");
    return `${citation}\nContent: ${content}`;
  }).join("\n\n---\n\n");

  const systemPrompt = `You are an intelligent email assistant. The user asked a question about their emails, and I've retrieved the relevant messages. 

Your task is to:
1. Analyze the email content to understand what each email is about
2. Answer the user's specific question based on the email content
3. Provide clear, helpful insights about the emails
4. Include the email citations in your response

Be concise but informative. Focus on answering what the user actually asked.`;

  const userPrompt = `User Question: ${question}

Retrieved Emails:
${emailContext}

Please analyze these emails and answer the user's question.`;

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return json.choices?.[0]?.message?.content || "I found your emails but couldn't analyze them properly.";
  } catch (error) {
    const DEBUG = (process.env.EMAIL_TOOL_DEBUG || "").toLowerCase() === "true";
    if (DEBUG) console.log("synthesizeEmailAnswer: error", { error: error instanceof Error ? error.message : String(error) });
    
    // Fallback to basic summary
    return emails.map((email, i) => {
      const citation = formatCitation(i + 1, { 
        subject: email.headers.subject, 
        from: email.headers.from, 
        internalDate: Date.parse(email.headers.date || "") || Date.now(),
        id: email.id // Gmail message ID for the link
      });
      const preview = email.text.split(/\s+/).slice(0, 30).join(" ");
      return `${citation}\nContent: ${preview}...`;
    }).join("\n\n");
  }
}

export async function answerWithEmail(tenantId: string, question: string, ragLowConfidence: boolean): Promise<EmailOrchestratorResult> {
  if (!shouldUseEmailTool(question, ragLowConfidence)) {
    return { ok: false, error: "not_email_intent" } as const;
  }

  const rag = await getTenantRagSettings(tenantId);
  const knobs = (rag as unknown as Partial<{ email_tool_max_results: number; email_tool_max_bodies: number; email_tool_cache_ttl_sec: number }>) || {};
  const maxResults = Number(knobs.email_tool_max_results ?? process.env.EMAIL_TOOL_MAX_RESULTS ?? 8);
  const maxBodies = Number(knobs.email_tool_max_bodies ?? process.env.EMAIL_TOOL_MAX_BODIES ?? 2);
  const ttlSec = Number(knobs.email_tool_cache_ttl_sec ?? process.env.EMAIL_TOOL_CACHE_TTL_SEC ?? 180);

  // Fast pre-check to avoid tool calls when user lacks permission
  const allowed = await hasPermission(tenantId, "email.read");
  if (!allowed) {
    return { ok: false, error: "You don’t have access to tenant email (need email.read)." };
  }

  // DEBUG: Log the original question to see what's being passed in
  const DEBUG = (process.env.EMAIL_TOOL_DEBUG || "").toLowerCase() === "true";
  if (DEBUG) console.log("emailOrchestrator.answerWithEmail: received_question", { question });

  // Transform natural language query using AI-powered transformer
  const queryTransform = await transformNaturalLanguageToGmailQueryAI(question);
  const query = buildGmailQueryString(queryTransform);
  const labelIds = queryTransform.labelIds;
  const searchMaxResults = Math.min(10, Math.max(1, queryTransform.max || maxResults));
  
  if (DEBUG) console.log("emailOrchestrator.answerWithEmail: processed", { 
    queryTransform, 
    finalQuery: query, 
    labelIds, 
    searchMaxResults 
  });

  const res = (await invoke("gmail", "search", { tenantId, query, labelIds, max: searchMaxResults, ttlSec })) as
    | { ok: true; items: Array<{ id: string; subject: string; from: string; internalDate: number }> }
    | { ok: false; error: { code: string; needsReconnect?: boolean } };

  if (!res.ok) {
    if (res.error.code === "forbidden") return { ok: false, error: "You don’t have access to tenant email (need email.read)." };
    if (res.error.code === "unauthorized") return { ok: false, error: "Please sign in." };
    if (res.error.code === "needs_reconnect") return { ok: false, error: "Gmail isn’t connected for this tenant—please reconnect." };
    if (res.error.code === "rate_limited") return { ok: false, error: "Too many email requests—please narrow your search or try later." };
    return { ok: false, error: "Email search failed." };
  }

  if (!res.items || res.items.length === 0) {
    return { ok: false, error: "I couldn’t find any matching emails in the time window you specified." };
  }

  const topCount = queryTransform.max ? Math.min(queryTransform.max, maxBodies) : Math.max(1, Math.min(3, maxBodies));
  const top = res.items.slice(0, topCount);
  const bodies: Array<{ text: string; headers: { subject: string; from: string; to: string; date: string }; threadId: string; id: string } | null> = [];
  for (const item of top) {
    const messageId = (item as { id: string }).id;
    const g = (await invoke("gmail", "getMessage", { tenantId, id: messageId })) as
      | { ok: true; message: { text: string; headers: { subject: string; from: string; to: string; date: string }; threadId: string } }
      | { ok: false; error: { code: string } };
    if (g && g.ok) {
      // Add the message ID to the email object
      bodies.push({ ...g.message, id: messageId });
    }
  }

  // Filter out null values
  const validBodies = bodies.filter((body): body is NonNullable<typeof body> => body !== null);
  
  if (validBodies.length === 0) return { ok: false, error: "I found related emails but couldn't fetch the contents." };

  // Process emails through AI to answer the user's question intelligently
  const answer = await synthesizeEmailAnswer(question, validBodies);
  return { ok: true, text: answer } as const;
}


