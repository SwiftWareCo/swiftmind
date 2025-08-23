import { createClient } from "@/server/supabase/server";
import { requirePermission } from "@/lib/utils/requirePermission";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { startGoogleConnectAction, disconnectGoogleAction } from "@/server/integrations/google.actions";
import { getGoogleIntegrationStatus } from "@/server/integrations/tokenManager";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Mail, AlertTriangle, Check, X, Plus } from "lucide-react";

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

  // server actions
  async function handleDisconnect() {
    "use server";
    await disconnectGoogleAction();
    redirect("/connections");
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
        <p className="text-muted-foreground mt-2">
          Connect external services to enhance your knowledge base and chat capabilities.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Gmail Integration */}
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <CardTitle className="text-lg">Gmail</CardTitle>
                <CardDescription className="text-sm">
                  Access and search your email messages
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={status.status} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              {status.status === "connected" && status.emailAddress && (
                <div className="rounded-lg bg-muted/50 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Connected Account</div>
                  <div className="text-sm font-mono break-all">{status.emailAddress}</div>
                </div>
              )}
              
              {(secretRes.data?.updated_at ?? secretRes.data?.created_at) && (
                <div className="text-xs text-muted-foreground">
                  Last updated: {new Date((secretRes.data?.updated_at ?? secretRes.data?.created_at) as string).toLocaleDateString()}
                </div>
              )}
            </div>

            <Separator />

            <div className="flex gap-2">
              {status.status === "not_connected" && <ConnectLinkButton />}
              {status.status !== "not_connected" && (
                <DisconnectButton onDisconnect={handleDisconnect} />
              )}
              {status.status === "needs_attention" && <ConnectLinkButton label="Reconnect" />}
            </div>

            {status.status === "not_connected" && (
              <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                Connect to enable email search in chat conversations
              </div>
            )}
            {status.status === "needs_attention" && (
              <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-3 rounded-lg border border-amber-200 dark:border-amber-800">
                Authentication expired. Please reconnect to continue using Gmail features.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Placeholder for future integrations */}
        <Card className="border-dashed border-2 hover:border-primary/50 transition-colors">
          <CardContent className="flex flex-col items-center justify-center h-full py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted/50 mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">More integrations</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Additional integrations will be added soon
            </p>
            <Button variant="ghost" disabled>
              Coming Soon
            </Button>
          </CardContent>
        </Card>

        {/* Another placeholder */}
        <Card className="border-dashed border-2 hover:border-primary/50 transition-colors md:col-span-2 lg:col-span-1">
          <CardContent className="flex flex-col items-center justify-center h-full py-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted/50 mb-4">
              <Plus className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Request Integration</h3>
            <p className="text-sm text-muted-foreground text-center mb-4">
              Need a specific integration?
            </p>
            <Button variant="ghost" disabled>
              Contact Support
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "connected":
      return (
        <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <Check className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      );
    case "needs_attention":
      return (
        <Badge variant="destructive" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Needs Attention
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary">
          Not Connected
        </Badge>
      );
  }
}

function DisconnectButton({ onDisconnect }: { onDisconnect: () => Promise<void> }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="outline" className="w-full">
          <X className="h-4 w-4 mr-2" />
          Disconnect
        </Button>
      }
      title="Disconnect Gmail?"
      description="This will remove access to your Gmail account and disable email search in chat conversations. You can reconnect at any time."
      confirmLabel="Disconnect"
      confirmVariant="destructive"
      onConfirm={onDisconnect}
    />
  );
}

async function ConnectLinkButton({ label }: { label?: string } = {}) {
  const res = await startGoogleConnectAction("/connections");
  if (!res.ok) {
    return <div className="text-sm text-red-600">Failed to start Google connect.</div>;
  }
  return (
    <Button asChild className="flex-1">
      <Link href={res.url}>
        <Check className="h-4 w-4 mr-2" />
        {label || "Connect"}
      </Link>
    </Button>
  );
}

