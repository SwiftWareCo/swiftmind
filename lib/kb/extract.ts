import "server-only";
import crypto from "node:crypto";

export type Section = { title: string | null; content: string; sectionIndex: number };

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

export async function hashContent(text: string): Promise<string> {
  const h = crypto.createHash("sha256");
  h.update(text);
  return h.digest("hex");
}

export async function extractTextAndSections(buffer: Buffer, fileName: string): Promise<{ text: string; sections: Section[]; fileExt: string }> {
  const ext = extFromName(fileName);
  if (ext === "pdf") return extractFromPdf(buffer, ext);
  if (ext === "md" || ext === "markdown") return extractFromMarkdown(buffer, ext);
  if (ext === "html" || ext === "htm") return extractFromHtml(buffer, ext);
  // default to text
  return extractFromText(buffer, ext || "txt");
}

async function extractFromPdf(buffer: Buffer, fileExt: string) {
  // For uniformity, use layout-aware extraction for PDFs; then split into sections by headings
  const { extractPdfLayout } = await import("./pdfLayout");
  const { text } = await extractPdfLayout(buffer);
  const sections = splitByHeadings(text);
  return { text, sections, fileExt };
}

async function extractFromMarkdown(buffer: Buffer, fileExt: string) {
  const { unified } = await import("unified");
  const remarkParse = (await import("remark-parse")).default;
  const strip = (await import("strip-markdown")).default;
  const md = buffer.toString("utf8");
  const processed = await unified().use(remarkParse).use(strip).process(md);
  const text = String(processed).trim();
  const sections = splitByHeadings(md, true);
  return { text, sections, fileExt };
}

async function extractFromHtml(buffer: Buffer, fileExt: string) {
  const { JSDOM } = await import("jsdom");
  const html = buffer.toString("utf8");
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const walker = doc.createTreeWalker(doc.body, dom.window.NodeFilter.SHOW_TEXT);
  const parts: string[] = [];
  let node: Node | null = walker.nextNode();
  while (node) {
    const t = node.nodeValue?.trim();
    if (t) parts.push(t);
    node = walker.nextNode();
  }
  const text = parts.join(" ").replace(/\s+/g, " ").trim();
  const outline = Array.from(doc.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li"))
    .map((el) => ({ tag: el.tagName.toLowerCase(), text: el.textContent?.trim() || "" }))
    .filter((x) => x.text);
  const sections = splitOutline(outline);
  return { text, sections, fileExt };
}

async function extractFromText(buffer: Buffer, fileExt: string) {
  const text = buffer.toString("utf8").replace(/\u0000/g, "").trim();
  const sections = splitByHeadings(text);
  return { text, sections, fileExt };
}

function splitByHeadings(text: string, isMarkdown: boolean = false): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let currentTitle: string | null = null;
  let currentContent: string[] = [];
  const push = () => {
    const content = currentContent.join("\n").trim();
    if (content) sections.push({ title: currentTitle, content, sectionIndex: sections.length });
    currentContent = [];
  };
  const headingRe = isMarkdown ? /^(#{1,6})\s+(.*)$/ : /^(.*)$/; // naive; for plain text treat blank lines as boundaries
  for (const line of lines) {
    const mdMatch = isMarkdown ? line.match(headingRe) : null;
    if (mdMatch) {
      if (currentContent.length) push();
      currentTitle = mdMatch[2].trim();
    } else {
      if (!line.trim() && currentContent.length) {
        push();
        currentTitle = null;
      } else {
        currentContent.push(line);
      }
    }
  }
  if (currentContent.length) push();
  if (sections.length === 0 && text) {
    sections.push({ title: null, content: text, sectionIndex: 0 });
  }
  return sections;
}

function splitOutline(outline: Array<{ tag: string; text: string }>): Section[] {
  const sections: Section[] = [];
  let currentTitle: string | null = null;
  let current: string[] = [];
  const push = () => {
    const content = current.join("\n").trim();
    if (content) sections.push({ title: currentTitle, content, sectionIndex: sections.length });
    current = [];
  };
  const isHeading = (tag: string) => /^h[1-6]$/.test(tag);
  for (const node of outline) {
    if (isHeading(node.tag)) {
      if (current.length) push();
      currentTitle = node.text;
    } else {
      current.push(node.text);
    }
  }
  if (current.length) push();
  return sections.length ? sections : [{ title: null, content: outline.map((o) => o.text).join("\n"), sectionIndex: 0 }];
}


