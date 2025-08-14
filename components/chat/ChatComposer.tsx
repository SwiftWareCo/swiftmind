"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp } from "lucide-react";

export function ChatComposer({ onSend, isPending }: { onSend: (text: string) => void; isPending: boolean }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");
  const maxHeight = 200; // px

  const submit = useCallback(() => {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue("");
  }, [onSend, value]);

  const autoResize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxHeight]);

  useEffect(() => {
    autoResize();
  }, [value, autoResize]);

  return (
    <div className="mx-auto max-w-8xl rounded-xl border p-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
        placeholder="Ask a question..."
        className="w-full resize-none bg-transparent px-2 py-2 text-sm outline-none break-words overflow-x-hidden"
        style={{ maxHeight, overflowWrap: "anywhere" }}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        onInput={autoResize}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <div />
        <Button
          size="sm"
          onClick={submit}
          disabled={isPending}
          aria-label="Send message"
          className="h-8 w-8 p-0 rounded-full"
        >
          <ArrowUp className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}


