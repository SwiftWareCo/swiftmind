import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { startGoogleConnectAction, disconnectGoogleAction } from "@/server/integrations/google.actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const slug = await getTenantSlug();
  if (!slug || !user) {
    return (
      <div className="p-8">
        <p>Not authorized.</p>
      </div>
    );
  }
  const tenant = await getTenantBySlug(slug);
  await requirePermission(tenant.id, "members.manage");

  const { data: secret } = await supabase
    .from("integration_secrets")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("provider", "google")
    .maybeSingle() as { data: { id: string; updated_at?: string; created_at?: string } | null };

  const connected = Boolean(secret);

  // server actions are invoked inline in form actions below

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Connections</h1>

      <div className="border rounded p-4 flex items-center justify-between">
        <div>
          <div className="font-medium">Google Gmail</div>
          <div className="text-sm text-muted-foreground">
            {connected
              ? (
                <>Connected{(secret?.updated_at ?? secret?.created_at)
                  ? ` • Updated ${new Date((secret?.updated_at ?? secret?.created_at) as string).toLocaleString()}`
                  : ""}</>
              )
              : (<>Not connected</>)}
          </div>
        </div>
        <div className="flex gap-2">
          {!connected ? (
            <ConnectLinkButton />
          ) : (
            <form action={async () => {
              "use server";
              await disconnectGoogleAction();
              redirect("/connections");
            }}>
              <Button variant="destructive" type="submit">Disconnect</Button>
            </form>
          )}
        </div>
      </div>

      {!connected && (
        <div className="mt-3 text-sm text-muted-foreground">You will be redirected to Google to grant access.</div>
      )}
    </div>
  );
}

async function ConnectLinkButton() {
  const res = await startGoogleConnectAction("/connections");
  if (!res.ok) {
    return <div className="text-sm text-red-600">Failed to start Google connect.</div>;
  }
  return (
    <Button asChild>
      <Link href={res.url}>Connect</Link>
    </Button>
  );
}

