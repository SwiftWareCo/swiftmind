"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createClient } from "@/server/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateRagSettingsAction } from "@/server/settings/settings.actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Props = { tenantId: string; isAdmin: boolean };

type RagSettings = {
  tenant_id: string;
  chat_model: string;
  temperature: number;
  max_context_tokens: number;
  embedding_model: string;
  retriever_top_k: number;
  overfetch: number;
  hybrid_enabled: boolean;
  rerank_enabled: boolean;
  default_allowed_roles: string[];
  retrieval_timeout_ms: number;
  updated_at: string;
};

export function RagControlsSection({ tenantId, isAdmin }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { data, refetch } = useQuery({
    queryKey: ["tenant_rag_settings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_rag_settings")
        .select("tenant_id, chat_model, temperature, max_context_tokens, embedding_model, retriever_top_k, overfetch, hybrid_enabled, rerank_enabled, default_allowed_roles, retrieval_timeout_ms, updated_at")
        .eq("tenant_id", tenantId)
        .maybeSingle<RagSettings>();
      if (error) throw new Error(error.message);
      return data!;
    },
    staleTime: 3000,
  });

  const [form, setForm] = useState<RagSettings | null>(null);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!form) return;
      const res = await updateRagSettingsAction({
        tenantId,
        chat_model: form.chat_model,
        temperature: form.temperature,
        max_context_tokens: form.max_context_tokens,
        embedding_model: form.embedding_model,
        retriever_top_k: form.retriever_top_k,
        overfetch: form.overfetch,
        hybrid_enabled: form.hybrid_enabled,
        rerank_enabled: form.rerank_enabled,
        default_allowed_roles: form.default_allowed_roles,
        retrieval_timeout_ms: form.retrieval_timeout_ms,
      });
      if (!res.ok) throw new Error(res.error);
    },
    onSuccess: () => {
      refetch();
    },
  });

  const current = form ?? data ?? null;

  return (
    <Card className="p-4 space-y-4">
      <div className="text-lg font-medium">RAG Controls</div>
      {current && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <L label="Chat model" hint="Primary LLM for composing answers. Heavier models are slower/costlier but more capable.">
            <Select
              value={current.chat_model}
              onValueChange={(val) => isAdmin && setForm({ ...(current as RagSettings), chat_model: val })}
              disabled={!isAdmin}
            >
              <SelectTrigger className="w-full"><SelectValue placeholder="Select a model" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-4o-mini">gpt-4o-mini (fast, cheap)</SelectItem>
                <SelectItem value="gpt-4o">gpt-4o (stronger)</SelectItem>
                <SelectItem value="o4-mini">o4-mini (reasoning-lite)</SelectItem>
              </SelectContent>
            </Select>
          </L>
          <L label="Temperature" hint="Higher = more creative; lower = more factual/deterministic.">
            <Input type="number" step="0.1" disabled={!isAdmin} value={current.temperature} onChange={(e) => setForm({ ...(current as RagSettings), temperature: Number(e.target.value) })} />
          </L>
          <L label="Max context tokens" hint="Upper bound on tokens used when building prompts; protects from oversized context windows.">
            <Input type="number" disabled={!isAdmin} value={current.max_context_tokens} onChange={(e) => setForm({ ...(current as RagSettings), max_context_tokens: Number(e.target.value) })} />
          </L>
          <L label="Embedding model" hint="Model used to vectorize queries and docs. Must match how your KB was embedded.">
            <Input disabled={!isAdmin} value={current.embedding_model} onChange={(e) => setForm({ ...(current as RagSettings), embedding_model: e.target.value })} />
          </L>
          <L label="Retriever top K" hint="How many passages to return after ranking. Lower for precision, higher for recall.">
            <Input type="number" disabled={!isAdmin} value={current.retriever_top_k} onChange={(e) => setForm({ ...(current as RagSettings), retriever_top_k: Number(e.target.value) })} />
          </L>
          <L label="Overfetch candidates" hint="How many candidates to consider pre-rerank/merge. Higher can improve quality at cost of latency.">
            <Input type="number" disabled={!isAdmin} value={current.overfetch} onChange={(e) => setForm({ ...(current as RagSettings), overfetch: Number(e.target.value) })} />
          </L>
          <L label="Hybrid search enabled" hint="Combine vector and keyword search for robustness to exact terms and semantics.">
            <Checkbox checked={current.hybrid_enabled} onCheckedChange={(v) => isAdmin && setForm({ ...(current as RagSettings), hybrid_enabled: Boolean(v) })} />
          </L>
          <L label="Rerank enabled" hint="Second-stage rerank with the LLM for higher precision; adds latency and cost.">
            <Checkbox checked={current.rerank_enabled} onCheckedChange={(v) => isAdmin && setForm({ ...(current as RagSettings), rerank_enabled: Boolean(v) })} />
          </L>
          <L label="Default allowed roles (comma-separated)" hint="Roles allowed to see retrieved chunks by default when ingesting content.">
            <Input disabled={!isAdmin} value={(current.default_allowed_roles || []).join(",")} onChange={(e) => setForm({ ...(current as RagSettings), default_allowed_roles: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
          </L>
          <L label="Retrieval timeout (ms)" hint="Stop retrieval early if it exceeds this time; lower reduces tail latency.">
            <Input type="number" disabled={!isAdmin} value={current.retrieval_timeout_ms} onChange={(e) => setForm({ ...(current as RagSettings), retrieval_timeout_ms: Number(e.target.value) })} />
          </L>
        </div>
      )}
      <div className="flex gap-2">
        <Button disabled={!isAdmin || updateMutation.isPending || !form} onClick={() => updateMutation.mutate()}>
          {updateMutation.isPending ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </Card>
  );
}

function L({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}


