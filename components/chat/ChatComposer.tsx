"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export function ChatComposer({ onSend, onRegenerate, isPending }: { onSend: (text: string) => void; onRegenerate?: () => void; isPending: boolean }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [value, setValue] = useState("");

  const submit = useCallback(() => {
    const v = value.trim();
    if (!v) return;
    onSend(v);
    setValue("");
  }, [onSend, value]);

  return (
    <div className="rounded-xl border p-2">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={1}
        placeholder="Ask a question..."
        className="w-full resize-none bg-transparent px-2 py-2 text-sm outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2 px-2 pb-1">
        <div>
          {onRegenerate && (
            <Button variant="ghost" size="sm" onClick={onRegenerate} disabled={isPending}>Regenerate</Button>
          )}
        </div>
        <Button size="sm" onClick={submit} disabled={isPending}>{isPending ? "Sending..." : "Send"}</Button>
      </div>
    </div>
  );
}


