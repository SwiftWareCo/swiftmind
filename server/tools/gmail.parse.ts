import "server-only";

// Minimal HTML → text sanitizer (no external deps)
export function htmlToText(html: string): string {
  try {
    // Remove script/style
    let s = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "");
    // Replace block-level tags with newlines
    s = s.replace(/<(?:p|div|br|tr|table|li|ul|ol|h[1-6])\b[^>]*>/gi, "\n");
    // Strip tags
    s = s.replace(/<[^>]+>/g, "");
    // Decode basic HTML entities
    s = s
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    // Collapse whitespace
    s = s.replace(/\s+/g, " ").trim();
    return s;
  } catch {
    return html;
  }
}

export function redactSecrets(text: string): string {
  // Replace obvious API keys / tokens (long base64/hex-like strings)
  return text
    .replace(/[A-Za-z0-9_\-]{24,}/g, "[REDACTED]")
    .replace(/(api[-_ ]?key|token|secret)[:=]\s*[^\s]+/gi, "$1: [REDACTED]");
}



export function decodeBase64Url(input: string): string {
  try {
    const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
    const padLength = (4 - (normalized.length % 4)) % 4;
    const padded = normalized + "=".repeat(padLength);
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

export function extractHeader(headers: Array<{ name?: string; value?: string }>, key: string): string {
  const h = headers.find((x) => (x.name || "").toLowerCase() === key.toLowerCase());
  return h?.value || "";
}

export function toCleanTextFromMessageParts(parts: any[]): string {
  // Prefer text/plain; fallback to text/html
  let text = "";
  const findPart = (p: any): any[] => {
    if (!p) return [];
    if (Array.isArray(p)) return p.flatMap(findPart);
    if (p.mimeType?.startsWith("multipart/")) return findPart(p.parts || []);
    return [p];
  };
  const flat = findPart(parts);
  const textPart = flat.find((p) => p.mimeType === "text/plain" && p.body?.data);
  if (textPart) {
    text = decodeBase64Url(textPart.body.data);
  } else {
    const htmlPart = flat.find((p) => p.mimeType === "text/html" && p.body?.data);
    if (htmlPart) {
      text = htmlToText(decodeBase64Url(htmlPart.body.data));
    }
  }
  return redactSecrets(text);
}


