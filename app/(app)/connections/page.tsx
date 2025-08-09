import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { startGoogleConnectAction, disconnectGoogleAction } from "@/server/integrations/google.actions";
import { getGoogleIntegrationStatus } from "@/server/integrations/tokenManager";
import { sendTestEmailAction } from "@/server/email/email.actions";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

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

  const secretRes = await supabase
    .from("integration_secrets")
    .select("*")
    .eq("tenant_id", tenant.id)
    .eq("provider", "google")
    .maybeSingle() as { data: { id: string; updated_at?: string; created_at?: string } | null };
  const status = await getGoogleIntegrationStatus(tenant.id);

  // server actions are invoked inline in form actions below

  const c = await cookies();
  const testEmailMsg = c.get("testEmailResult");

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-semibold mb-6">Connections</h1>

      <div className="border rounded p-4 flex items-center justify-between">
        <div>
          <div className="font-medium">Google Gmail</div>
          <div className="text-sm text-muted-foreground">
            {status.status === "connected" && (
              <>Connected{(secretRes.data?.updated_at ?? secretRes.data?.created_at)
                ? ` • Updated ${new Date((secretRes.data?.updated_at ?? secretRes.data?.created_at) as string).toLocaleString()}`
                : ""}</>
            )}
            {status.status === "needs_attention" && (
              <>Needs attention{(status.updatedAt)
                ? ` • Updated ${new Date(status.updatedAt).toLocaleString()}`
                : ""}</>
            )}
            {status.status === "not_connected" && (<>Not connected</>)}
          </div>
        </div>
        <div className="flex gap-2">
          {status.status === "not_connected" && <ConnectLinkButton />}
          {status.status !== "not_connected" && (
            <form action={async () => {
              "use server";
              await disconnectGoogleAction();
              redirect("/connections");
            }}>
              <Button variant="destructive" type="submit">Disconnect</Button>
            </form>
          )}
          {status.status === "needs_attention" && <ConnectLinkButton label="Reconnect" />}
        </div>
      </div>

      {status.status === "not_connected" && (
        <div className="mt-3 text-sm text-muted-foreground">You will be redirected to Google to grant access.</div>
      )}

      {status.status === "connected" && (
        <div className="mt-4">
          <form action={async () => {
            "use server";
            const supa = await createClient();
            const { data: { user: u } } = await supa.auth.getUser();
            const toEmail = String(u?.email || "");
            const result = await sendTestEmailAction(tenant.id, toEmail);
            const c = await cookies();
            const cookieOptions = {
              path: "/connections",
              maxAge: 10,
              httpOnly: true,
              sameSite: "lax" as const,
              secure: process.env.NODE_ENV === "production",
            };
            if (!result.ok) {
              c.set("testEmailResult", `error:${result.error}` , cookieOptions);
            } else {
              c.set("testEmailResult", `ok:${result.messageId}` , cookieOptions);
            }
            redirect("/connections");
          }}>
            <Button type="submit">Send test email</Button>
          </form>
          <div className="mt-2 text-xs text-muted-foreground">Sends to your signed-in email by default.</div>
          {testEmailMsg && (
            <div className="mt-2 text-sm">
              {testEmailMsg.value.startsWith("ok:") ? (
                <span className="text-green-700">Sent! Message ID: {testEmailMsg.value.slice(3)}</span>
              ) : (
                <span className="text-red-600">Failed to send: {testEmailMsg.value.slice(6)}</span>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

async function ConnectLinkButton({ label }: { label?: string } = {}) {
  const res = await startGoogleConnectAction("/connections");
  if (!res.ok) {
    return <div className="text-sm text-red-600">Failed to start Google connect.</div>;
  }
  return (
    <Button asChild>
      <Link href={res.url}>{label || "Connect"}</Link>
    </Button>
  );
}

