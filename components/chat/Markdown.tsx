"use client";

import { useMemo } from "react";
import { unified } from "unified";
import remarkParse from "remark-parse";

type Node = { type: string; value?: string; children?: Node[] };

function renderNode(node: Node, key?: number): JSX.Element | null {
  switch (node.type) {
    case "text":
      return <span key={key}>{node.value}</span>;
    case "paragraph":
      return <p key={key} className="leading-relaxed">{node.children?.map((c, i) => renderNode(c, i))}</p>;
    case "emphasis":
      return <em key={key}>{node.children?.map((c, i) => renderNode(c, i))}</em>;
    case "strong":
      return <strong key={key}>{node.children?.map((c, i) => renderNode(c, i))}</strong>;
    case "inlineCode":
      return <code key={key} className="rounded bg-muted px-1 py-0.5 text-xs">{node.value}</code>;
    case "code":
      return (
        <pre key={key} className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
          <code>{node.value}</code>
        </pre>
      );
    case "list":
      return node.ordered ? (
        <ol key={key} className="list-decimal pl-5 space-y-1">{node.children?.map((c, i) => renderNode(c, i))}</ol>
      ) : (
        <ul key={key} className="list-disc pl-5 space-y-1">{node.children?.map((c, i) => renderNode(c, i))}</ul>
      ) as unknown as JSX.Element;
    case "listItem":
      return <li key={key}>{node.children?.map((c, i) => renderNode(c, i))}</li>;
    case "link":
      return <a key={key} href={(node as unknown as { url?: string }).url} className="underline" target="_blank" rel="noreferrer">{node.children?.map((c, i) => renderNode(c, i))}</a>;
    case "heading":
      return <div key={key} className="font-semibold">{node.children?.map((c, i) => renderNode(c, i))}</div>;
    default:
      return node.children ? <span key={key}>{node.children.map((c, i) => renderNode(c, i))}</span> : null;
  }
}

export function Markdown({ text }: { text: string }) {
  const tree = useMemo(() => {
    try {
      const file = unified().use(remarkParse as any).parse(text);
      return file as unknown as Node;
    } catch {
      return { type: "paragraph", children: [{ type: "text", value: text }] } as Node;
    }
  }, [text]);

  const children = (tree as unknown as { children?: Node[] }).children || [];
  return (
    <div className="prose prose-sm max-w-none dark:prose-invert">{children.map((c, i) => renderNode(c, i))}</div>
  );
}


