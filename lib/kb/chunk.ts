import "server-only";
import type { Section } from "./extract";

export type Chunk = { title: string | null; content: string; sectionIndex: number };

type ChunkOptions = {
  targetTokens: number;
  overlapTokens: number;
};

const AVG_CHARS_PER_TOKEN = 4; // rough heuristic

export function chunkContent(sections: Section[], opts: ChunkOptions): Chunk[] {
  const maxChars = opts.targetTokens * AVG_CHARS_PER_TOKEN;
  const overlapChars = opts.overlapTokens * AVG_CHARS_PER_TOKEN;
  const chunks: Chunk[] = [];

  for (const sec of sections) {
    const text = sec.content.replace(/\s+/g, " ").trim();
    if (!text) continue;

    if (text.length <= maxChars) {
      chunks.push({ title: sec.title, content: text, sectionIndex: sec.sectionIndex });
      continue;
    }

    let start = 0;
    while (start < text.length) {
      const end = Math.min(start + maxChars, text.length);
      let slice = text.slice(start, end);
      // try to cut at sentence boundary
      const lastPeriod = slice.lastIndexOf(". ");
      if (end < text.length && lastPeriod > maxChars * 0.6) {
        slice = slice.slice(0, lastPeriod + 1);
      }
      chunks.push({ title: sec.title, content: slice.trim(), sectionIndex: sec.sectionIndex });
      if (end >= text.length) break;
      start = start + slice.length - overlapChars;
      if (start < 0) start = 0;
    }
  }

  return chunks;
}


