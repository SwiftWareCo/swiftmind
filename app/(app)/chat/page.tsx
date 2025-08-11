import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";

export default async function ChatPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);

  return (
    <div className="container mx-auto max-w-5xl">
      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <h1 className="text-2xl font-semibold">Chat</h1>
          <div className="rounded-md border p-4 text-sm text-muted-foreground">Chat UI coming soon.</div>
        </div>
        <aside className="hidden md:block">
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">Sources will appear with each answer.</div>
        </aside>
      </div>
    </div>
  );
}


