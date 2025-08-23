import "server-only";

export interface GmailQueryTransform {
  query: string;
  labelIds?: string[];
  max?: number;
  sortOrder?: "newest" | "oldest";
  timeFilter?: string;
}

/**
 * AI-powered natural language to Gmail query transformer
 * Uses OpenAI to understand intent and generate appropriate Gmail search operators
 */
export async function transformNaturalLanguageToGmailQueryAI(
  rawQuery: string,
  defaultTimeWindow = "newer_than:14d"
): Promise<GmailQueryTransform> {
  const DEBUG = (process.env.EMAIL_TOOL_DEBUG || "").toLowerCase() === "true";
  
  if (DEBUG) console.log("gmail.ai-transformer: input", { rawQuery });
  
  // Clean up conversation context pollution first
  const cleanQuery = cleanConversationContext(rawQuery);
  
  if (DEBUG) console.log("gmail.ai-transformer: cleaned", { cleanQuery });

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // Fallback to pattern-based transformer
    if (DEBUG) console.log("gmail.ai-transformer: no_openai_key, falling_back");
    return fallbackPatternTransform(cleanQuery, defaultTimeWindow);
  }

  try {
    const systemPrompt = `You are an expert Gmail search query transformer. Your task is to convert natural language questions about emails into structured Gmail search parameters.

Return a JSON object with these fields:
- query: Gmail search query string (use Gmail operators like from:, to:, subject:, is:unread, etc.)
- labelIds: Array of Gmail labels to search (e.g., ["INBOX"], ["SENT"], null for all)
- max: Maximum number of results (1-20)
- timeFilter: Time constraint (e.g., "newer_than:7d", "older_than:30d", null for no constraint)

Examples:
Input: "what was my last email about"
Output: {"query": "", "labelIds": ["INBOX"], "max": 1, "timeFilter": "newer_than:30d"}

Input: "emails from john@example.com this week"
Output: {"query": "from:john@example.com", "labelIds": null, "max": 10, "timeFilter": "newer_than:7d"}

Input: "unread emails about project alpha"
Output: {"query": "is:unread subject:project alpha OR project alpha", "labelIds": ["INBOX"], "max": 20, "timeFilter": null}

Input: "last 5 emails"
Output: {"query": "", "labelIds": ["INBOX"], "max": 5, "timeFilter": "newer_than:30d"}

Always return valid JSON. Be smart about interpreting intent.`;

    const userPrompt = `Transform this natural language query into Gmail search parameters:

"${cleanQuery}"

Return only the JSON object, no explanation.`;

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!res.ok) throw new Error(`OpenAI API error: ${res.status}`);
    
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = json.choices?.[0]?.message?.content?.trim();
    
    if (!content) throw new Error("Empty response from OpenAI");

    // Parse the JSON response
    const transform = JSON.parse(content) as GmailQueryTransform;
    
    // Apply default time filter if none specified and no time operators in query
    if (!transform.timeFilter && !hasTimeOperator(transform.query || "")) {
      transform.timeFilter = defaultTimeWindow;
    }
    
    if (DEBUG) console.log("gmail.ai-transformer: ai_result", { transform });
    
    return transform;
  } catch (error) {
    if (DEBUG) console.log("gmail.ai-transformer: ai_error", { 
      error: error instanceof Error ? error.message : String(error) 
    });
    
    // Fallback to pattern-based transformer
    return fallbackPatternTransform(cleanQuery, defaultTimeWindow);
  }
}

/**
 * Removes conversation context that pollutes Gmail searches
 */
function cleanConversationContext(query: string): string {
  // Remove context markers
  const contextMarkers = [
    /Context \(recent turns\):/gi,
    /Assistant:/gi,
    /User:/gi,
    /I couldn['']t find.*?specified\./gi,
  ];
  
  let cleaned = query;
  for (const marker of contextMarkers) {
    cleaned = cleaned.replace(marker, "");
  }
  
  // Split by lines and take the first meaningful line (usually the actual query)
  const lines = cleaned.split('\n').map(line => line.trim()).filter(Boolean);
  if (lines.length > 0) {
    // Take the first line that looks like a user query
    const userQuery = lines.find(line => 
      !line.startsWith('Assistant:') && 
      !line.startsWith('User:') &&
      !line.includes('Context (recent turns)') &&
      line.length > 3
    );
    if (userQuery) {
      return userQuery.trim();
    }
  }
  
  return cleaned.trim();
}

/**
 * Fallback pattern-based transformer when AI is unavailable
 */
function fallbackPatternTransform(query: string, defaultTimeWindow: string): GmailQueryTransform {
  const lowerQuery = query.toLowerCase();
  
  // Pattern: "last email" or "latest email" or "most recent email"
  if (/\b(last|latest|most recent|newest)\s+email/i.test(lowerQuery)) {
    return {
      query: "",
      labelIds: ["INBOX"],
      max: 1,
      sortOrder: "newest",
      timeFilter: "newer_than:30d"
    };
  }
  
  // Pattern: "last N emails"
  const lastNMatch = lowerQuery.match(/\blast\s+(\d+)\s+emails?/i);
  if (lastNMatch) {
    const count = Math.min(parseInt(lastNMatch[1], 10), 10);
    return {
      query: "",
      labelIds: ["INBOX"],
      max: count,
      sortOrder: "newest",
      timeFilter: "newer_than:30d"
    };
  }
  
  // Pattern: "emails from [person/domain]"
  const fromMatch = query.match(/emails?\s+from\s+([^\s]+(?:\s+[^\s]+)*?)(?:\s|$)/i);
  if (fromMatch) {
    const fromValue = fromMatch[1].trim();
    return {
      query: `from:${fromValue}`,
      max: 10,
      sortOrder: "newest"
    };
  }
  
  // Pattern: "unread emails"
  if (/\bunread\s+emails?/i.test(lowerQuery)) {
    return {
      query: "is:unread",
      labelIds: ["INBOX"],
      max: 20,
      sortOrder: "newest"
    };
  }
  
  // Default: treat as general search term
  return {
    query: query.trim(),
    max: 10,
    sortOrder: "newest",
    timeFilter: defaultTimeWindow
  };
}

/**
 * Checks if query has time-based operators
 */
function hasTimeOperator(query: string): boolean {
  const timeOperators = [
    /\bnewer_than:/i,
    /\bolder_than:/i,
    /\bafter:/i,
    /\bbefore:/i
  ];
  
  return timeOperators.some(op => op.test(query));
}

/**
 * Builds the final Gmail query string with all components
 */
export function buildGmailQueryString(transform: GmailQueryTransform): string {
  const DEBUG = (process.env.EMAIL_TOOL_DEBUG || "").toLowerCase() === "true";
  
  const parts: string[] = [];
  
  if (transform.query && transform.query.trim()) {
    parts.push(transform.query.trim());
  }
  
  if (transform.timeFilter) {
    parts.push(transform.timeFilter);
  }
  
  const result = parts.filter(Boolean).join(" ");
  
  if (DEBUG) console.log("gmail.ai-transformer: query_string_built", { 
    input: transform, 
    parts, 
    result 
  });
  
  return result;
}
