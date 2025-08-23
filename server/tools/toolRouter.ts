"use server";

import "server-only";
import * as gmail from "@/server/tools/gmail.provider";

export type Provider = "gmail";
export type ToolName = "search" | "getMessage";

export async function invoke(provider: Provider, tool: ToolName, args: unknown): Promise<unknown> {
  if (provider === "gmail") {
    if (tool === "search") return gmail.search(args as gmail.GmailSearchArgs);
    if (tool === "getMessage") return gmail.getMessage(args as gmail.GmailGetMessageArgs);
  }
  return { ok: false, error: { code: "unknown_tool" } } as const;
}



