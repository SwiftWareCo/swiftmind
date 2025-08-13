import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: string | null }) {
  const s = (status || "").toLowerCase();
  let variant: "default" | "secondary" | "destructive" | "outline" = "secondary";
  let label = status || "Unknown";
  if (s === "ready" || s === "ingested") {
    variant = "default";
    label = "Ready";
  } else if (s === "processing" || s === "ingesting") {
    variant = "outline";
    label = "Processing";
  } else if (s === "error" || s === "failed") {
    variant = "destructive";
    label = "Error";
  }
  return <Badge variant={variant}>{label}</Badge>;
}


