import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { createClient } from "@/server/supabase/server";
import { ChatRoot, type AskResult } from "@/components/chat/ChatRoot";
import { askInSessionAction, createSessionAction } from "@/server/chat/chat.actions";
import { ChatPageClient } from "@/components/chat/ChatPageClient";

export default async function ChatPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let displayName: string | null = null;
  let avatarUrl: string | null = null;
  if (user) {
    const { data } = await supabase
      .from("users")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string | null; avatar_url: string | null }>();
    displayName = data?.display_name ?? null;
    avatarUrl = data?.avatar_url ?? null;
  }

  async function createSession(): Promise<string> {
    "use server";
    const res = await createSessionAction({ tenantId: tenant.id });
    if (!res.ok) throw new Error(res.error);
    return res.id;
  }

  async function ask(sessionId: string, question: string): Promise<AskResult> {
    "use server";
    const res = await askInSessionAction({ tenantId: tenant.id, sessionId, question });
    if (!res.ok) return res;
    return { ok: true, text: res.text, citations: res.citations };
  }

  return <ChatPageClient tenantId={tenant.id} currentUser={{ displayName, avatarUrl }} ask={ask} />;
}


