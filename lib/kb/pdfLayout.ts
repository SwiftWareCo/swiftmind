'use server'

export type BBox = { x: number; y: number; w: number; h: number };
export type PdfToken = { text: string; page: number; x: number; y: number; w: number; h: number; fontSize: number };
export type PdfLine = { text: string; page: number; bbox: BBox; tokens: PdfToken[] };
export type KvCandidate = { label: string; value: string; page: number; bboxes: BBox[] };

export type LayoutChunk = {
  content: string;
  sectionIndex: number;
  meta: {
    page_start: number;
    page_end: number;
    bbox_union: BBox;
    kv_candidates: KvCandidate[];
    line_bboxes: Array<{ page: number; bbox: BBox }>;
  };
};

type PdfTextItem = { str: string; transform: number[]; width?: number; height?: number; fontName?: string };

function unionBBox(a: BBox, b: BBox): BBox {
  const minX = Math.min(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxX = Math.max(a.x + a.w, b.x + b.w);
  const maxY = Math.max(a.y + a.h, b.y + b.h);
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function bboxFromToken(t: PdfToken): BBox {
  return { x: t.x, y: t.y, w: t.w, h: t.h };
}

function isLikelyValue(text: string): boolean {
  const s = text.trim();
  if (!s) return false;
  // Mostly alphanumeric with at least one digit or uppercase letter; allow spaces within
  const hasDigit = /\d/.test(s);
  const hasUpper = /[A-Z]/.test(s);
  const mostlyWord = /^[A-Za-z0-9][A-Za-z0-9 \-\/.]*$/.test(s);
  return mostlyWord && (hasDigit || hasUpper);
}

function normalizeSpaces(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function insertPunctuationIfMissing(lineTokens: PdfToken[]): { text: string; tokens: PdfToken[] } {
  if (lineTokens.length === 0) return { text: "", tokens: [] };
  // Rebuild with simple spacing heuristics using x-gaps
  const pieces: string[] = [];
  const tokensOut: PdfToken[] = [];
  const avgFont = lineTokens.reduce((a, t) => a + t.fontSize, 0) / lineTokens.length;
  const smallGap = Math.max(2, avgFont * 0.25);

  for (let i = 0; i < lineTokens.length; i++) {
    const t = lineTokens[i];
    const prev = i > 0 ? lineTokens[i - 1] : null;
    const gap = prev ? t.x - (prev.x + prev.w) : 0;
    const needsSpace = prev ? gap > smallGap : false;

    const chunk = t.text;
    // If previous looked like a label and we have a value now, insert ": "
    if (prev && needsSpace) {
      const prevTrim = prev.text.trim();
      const prevLooksLabel = /[:#]$/.test(prevTrim) || /^(?:\w{2,}|No\.?|ID|Ref)\.?$/.test(prevTrim);
      if (prevLooksLabel && isLikelyValue(t.text)) {
        pieces.push(": ");
      } else {
        pieces.push(" ");
      }
    }

    pieces.push(chunk);
    tokensOut.push(t);
  }

  return { text: normalizeSpaces(pieces.join("")), tokens: tokensOut };
}

function groupTokensIntoLines(tokens: PdfToken[]): PdfLine[] {
  const byPage = new Map<number, PdfToken[]>();
  for (const t of tokens) {
    const list = byPage.get(t.page) || [];
    list.push(t);
    byPage.set(t.page, list);
  }

  const lines: PdfLine[] = [];

  for (const [page, pageTokens] of byPage.entries()) {
    pageTokens.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    const avgFont = pageTokens.reduce((a, t) => a + t.fontSize, 0) / Math.max(1, pageTokens.length);
    const yBand = Math.max(2, avgFont * 0.6);

    type LineAcc = { tokens: PdfToken[] };
    const acc: LineAcc[] = [];
    for (const t of pageTokens) {
      const last = acc.length > 0 ? acc[acc.length - 1] : null;
      if (!last) {
        acc.push({ tokens: [t] });
        continue;
      }
      const lastY = last.tokens[0].y;
      if (Math.abs(t.y - lastY) <= yBand) {
        last.tokens.push(t);
      } else {
        acc.push({ tokens: [t] });
      }
    }

    // Build lines with adjusted punctuation
    for (const a of acc) {
      a.tokens.sort((u, v) => u.x - v.x);
      // Some lines contain multiple label-value pairs; split on new label starts with sufficient gap
      const splitLines = splitByLabelStarts(a.tokens);
      for (const toks of splitLines) {
        const { text, tokens: outTokens } = insertPunctuationIfMissing(toks);
        const bbox = outTokens.reduce<BBox | null>((bb, tt) => (bb ? unionBBox(bb, bboxFromToken(tt)) : bboxFromToken(tt)), null as BBox | null) as BBox;
        lines.push({ text, page, bbox, tokens: outTokens });
      }
    }
  }

  // Column ordering: cluster lines on each page by x-start; then order columns left->right and lines top->bottom per column
  const byPageLines = new Map<number, PdfLine[]>();
  for (const ln of lines) {
    const list = byPageLines.get(ln.page) || [];
    list.push(ln);
    byPageLines.set(ln.page, list);
  }

  const final: PdfLine[] = [];
  for (const [, pageLines] of byPageLines.entries()) {
    if (pageLines.length === 0) continue;
    // Simple clustering by x using gap threshold
    const sorted = [...pageLines].sort((a, b) => a.bbox.x - b.bbox.x);
    const columns: PdfLine[][] = [];
    const avgWidth = sorted.reduce((a, l) => a + l.bbox.w, 0) / Math.max(1, sorted.length);
    const xGap = Math.max(10, avgWidth * 0.5);
    for (const ln of sorted) {
      const placed = columns.find((col) => Math.abs(col[0].bbox.x - ln.bbox.x) <= xGap);
      if (placed) placed.push(ln);
      else columns.push([ln]);
    }
    columns.sort((a, b) => a[0].bbox.x - b[0].bbox.x);
    for (const col of columns) {
      col.sort((a, b) => a.bbox.y - b.bbox.y);
      final.push(...col);
    }
  }

  return final;
}

function splitByLabelStarts(tokens: PdfToken[]): PdfToken[][] {
  if (tokens.length === 0) return [];
  const result: PdfToken[][] = [];
  const avgFont = tokens.reduce((a, t) => a + t.fontSize, 0) / tokens.length;
  const bigGap = Math.max(20, avgFont * 3);
  let current: PdfToken[] = [];
  const looksLabel = (s: string) => /[:#]$/.test(s.trim()) || /^(?:No\.?|ID|Ref)\.?$/.test(s.trim());
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    const prev = i > 0 ? tokens[i - 1] : null;
    const gap = prev ? t.x - (prev.x + prev.w) : 0;
    const startNew = prev && gap > bigGap && looksLabel(t.text);
    if (startNew && current.length > 0) {
      result.push(current);
      current = [t];
    } else {
      current.push(t);
    }
  }
  if (current.length > 0) result.push(current);
  return result;
}

function detectKvCandidates(lines: PdfLine[]): KvCandidate[] {
  const kv: KvCandidate[] = [];
  for (const line of lines) {
    const tks = line.tokens;
    for (let i = 0; i < tks.length - 1; i++) {
      const a = tks[i];
      const b = tks[i + 1];
      const aTrim = a.text.trim();
      const looksLabel = /[:#]$/.test(aTrim) || /^(?:No\.?|ID|Ref)\.?$/.test(aTrim);
      const gap = b.x - (a.x + a.w);
      if (looksLabel && gap < a.fontSize * 5 && isLikelyValue(b.text)) {
        // Merge subsequent value tokens within small gaps
        const valueTokens: PdfToken[] = [b];
        let j = i + 2;
        while (j < tks.length) {
          const prev = valueTokens[valueTokens.length - 1];
          const next = tks[j];
          const g = next.x - (prev.x + prev.w);
          if (g <= prev.fontSize * 0.8 && isLikelyValue(next.text)) {
            valueTokens.push(next);
            j++;
          } else break;
        }
        const label = aTrim.replace(/[:#]$/, "").trim();
        const value = normalizeSpaces(valueTokens.map((vt) => vt.text).join(" "));
        const bboxes = [bboxFromToken(a), ...valueTokens.map(bboxFromToken)];
        kv.push({ label, value, page: line.page, bboxes });
      }
    }
  }
  return kv.slice(0, 1000); // safety cap
}

type PdfTextContent = { items: PdfTextItem[] };
type PdfPage = { getTextContent: () => Promise<PdfTextContent> };
type PdfDocument = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type PdfGetDocumentArg =
  | Uint8Array
  | {
      data: Uint8Array;
      standardFontDataUrl?: string;
    };
type PdfjsModule = { getDocument: (src: PdfGetDocumentArg) => { promise: Promise<PdfDocument> } };

export async function extractPdfTokens(buffer: Buffer): Promise<{ tokens: PdfToken[]; pageCount: number }> {
  console.log(`📄 extractPdfTokens: Starting token extraction, buffer size: ${buffer.length} bytes`);
  
  try {
    // Simple and robust SSR pattern: polyfill Promises with resolvers, import worker module, then main module
    console.log(`📄 extractPdfTokens: Importing @ungap/with-resolvers`);
    await import("@ungap/with-resolvers");
    
    console.log(`📄 extractPdfTokens: Importing PDF.js worker module (legacy)`);
    await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
    
    console.log(`📄 extractPdfTokens: Importing PDF.js main module (legacy)`);
    const mod = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as unknown as PdfjsModule & { setVerbosityLevel?: (v: number) => void; VerbosityLevel?: { ERROR: number } };
    
    console.log(`📄 extractPdfTokens: Setting PDF.js verbosity level`);
    if (typeof mod.setVerbosityLevel === "function" && mod.VerbosityLevel && typeof mod.VerbosityLevel.ERROR === "number") {
      mod.setVerbosityLevel(mod.VerbosityLevel.ERROR);
    }
    
    console.log(`📄 extractPdfTokens: Creating document loading task`);
    const data = new Uint8Array(buffer);
    const STANDARD_FONTS_URL = process.env.PDFJS_STANDARD_FONTS_URL || "https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.54/standard_fonts/";
    const loadingTask = mod.getDocument({ data, standardFontDataUrl: STANDARD_FONTS_URL });
    
    console.log(`📄 extractPdfTokens: Loading PDF document`);
    const doc = await loadingTask.promise;
    const pageCount: number = doc.numPages as number;
    console.log(`📄 extractPdfTokens: Document loaded with ${pageCount} pages`);
    
    const tokens: PdfToken[] = [];
    console.log(`📄 extractPdfTokens: Starting page processing`);
    
    for (let p = 1; p <= pageCount; p++) {
      console.log(`📄 extractPdfTokens: Processing page ${p}/${pageCount}`);
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      
      for (const item of content.items as PdfTextItem[]) {
        const str = (item.str || "").replace(/\u0000/g, "");
        if (!str) continue;
        const m = item.transform || [1, 0, 0, 1, 0, 0];
        const a = m[0];
        const d = m[3];
        const e = m[4];
        const f = m[5];
        const fontSize = Math.max(1, Math.abs(d));
        const w = typeof item.width === "number" ? item.width : Math.abs(a) * str.length * (fontSize * 0.5) * 0.01;
        const h = typeof item.height === "number" ? item.height : fontSize;
        tokens.push({ text: str, page: p, x: e, y: f, w, h, fontSize });
      }
    }
    
    console.log(`✅ extractPdfTokens: Successfully extracted ${tokens.length} tokens from ${pageCount} pages`);
    return { tokens, pageCount };
  } catch (error) {
    console.error(`❌ extractPdfTokens: PDF token extraction failed:`, error);
    console.error(`❌ extractPdfTokens: Error details:`, {
      name: error instanceof Error ? error.name : 'Unknown',
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : 'No stack trace'
    });
    throw error;
  }
}

export async function extractPdfLayout(buffer: Buffer): Promise<{ lines: PdfLine[]; text: string; pageCount: number; kv_candidates: KvCandidate[] }> {
  console.log(`📄 extractPdfLayout: Starting PDF layout extraction, buffer size: ${buffer.length} bytes`);
  
  try {
    console.log(`📄 extractPdfLayout: About to extract PDF tokens`);
    const { tokens, pageCount } = await extractPdfTokens(buffer);
    console.log(`📄 extractPdfLayout: Extracted ${tokens.length} tokens from ${pageCount} pages`);
    
    console.log(`📄 extractPdfLayout: About to group tokens into lines`);
    const lines = groupTokensIntoLines(tokens);
    console.log(`📄 extractPdfLayout: Grouped into ${lines.length} lines`);
    
    console.log(`📄 extractPdfLayout: About to detect KV candidates`);
    const kv_candidates = detectKvCandidates(lines);
    console.log(`📄 extractPdfLayout: Detected ${kv_candidates.length} KV candidates`);
    
    const text = lines.map((l) => l.text).join("\n");
    console.log(`✅ extractPdfLayout: Successfully completed, text length: ${text.length} chars`);
    
    return { lines, text, pageCount, kv_candidates };
  } catch (error) {
    console.error(`❌ extractPdfLayout: Failed to extract PDF layout:`, error);
    console.error(`❌ extractPdfLayout: Error stack:`, error instanceof Error ? error.stack : 'No stack trace');
    throw error;
  }
}

export async function chunkLinesToLayoutChunks(lines: PdfLine[], kvAll: KvCandidate[], targetTokens: number): Promise<LayoutChunk[]> {
  const chunks: LayoutChunk[] = [];
  const AVG_CHARS_PER_TOKEN = 4;
  const maxChars = targetTokens * AVG_CHARS_PER_TOKEN;

  let buf: PdfLine[] = [];
  let chars = 0;
  let sectionIndex = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const content = buf.map((l) => l.text).join("\n");
    const pages = buf.map((l) => l.page);
    const page_start = Math.min(...pages);
    const page_end = Math.max(...pages);
    const line_bboxes = buf.map((l) => ({ page: l.page, bbox: l.bbox }));
    const bbox_union = line_bboxes.reduce<BBox | null>((bb, cur) => (bb ? unionBBox(bb, cur.bbox) : cur.bbox), null as BBox | null) as BBox;
    const kv_candidates = kvAll.filter((kv) => kv.page >= page_start && kv.page <= page_end);
    chunks.push({ content, sectionIndex: sectionIndex++, meta: { page_start, page_end, bbox_union, kv_candidates, line_bboxes } });
    buf = [];
    chars = 0;
  };

  for (const ln of lines) {
    const lnChars = ln.text.length + 1; // include newline
    if (chars + lnChars > maxChars && buf.length > 0) flush();
    buf.push(ln);
    chars += lnChars;
  }
  flush();
  return chunks;
}


