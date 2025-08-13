import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { createClient } from "@/server/supabase/server";
import { ChatRoot, type AskResult } from "@/components/chat/ChatRoot";
import { askTenantAction } from "@/server/chat/chat.actions";

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

  async function ask(question: string): Promise<AskResult> {
    "use server";
    return askTenantAction({ tenantId: tenant.id, question });
  }

  return (
    <div className="container mx-auto max-w-8xl">
      <h1 className="mb-4 text-2xl font-semibold">Chat</h1>
      <ChatRoot currentUser={{ displayName, avatarUrl }} ask={ask} />
    </div>
  );
}


