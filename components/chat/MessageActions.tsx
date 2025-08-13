"use client";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function CopyButton({ text }: { text: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast.success("Copied to clipboard");
        } catch {
          toast.error("Failed to copy");
        }
      }}
    >
      Copy
    </Button>
  );
}


