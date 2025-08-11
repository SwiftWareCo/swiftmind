import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { requirePermission } from "@/lib/utils/requirePermission";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { startGoogleConnectAction } from "@/server/integrations/google.actions";
import { getGoogleIntegrationStatus } from "@/server/integrations/tokenManager";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { UploadForm } from "../knowledge/upload-form";

export default async function OnboardingPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  await requirePermission(tenant.id, "members.manage");

  const gmail = await getGoogleIntegrationStatus(tenant.id);
  const connectRes = gmail.status !== "connected" ? await startGoogleConnectAction("/onboarding") : null;

  return (
    <div className="container mx-auto max-w-5xl space-y-6">
      <h1 className="text-2xl font-semibold">Onboarding</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>1) Bring your data</CardTitle>
            <CardDescription>Upload a document and optionally connect Gmail.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <UploadForm tenantId={tenant.id} />
            <div className="rounded-md border p-3 text-sm flex items-center justify-between">
              <div>Gmail: {gmail.status === "connected" ? "Connected" : gmail.status === "needs_attention" ? "Needs reconnect" : "Not connected"}</div>
              {gmail.status !== "connected" && connectRes?.ok && (
                <Button asChild><Link href={connectRes.url}>{gmail.status === "needs_attention" ? "Reconnect" : "Connect"}</Link></Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2) Invite teammates</CardTitle>
            <CardDescription>Invites are managed by your CSM for now.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground">We’ll notify your CSM to add members for you.</div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>3) Finish</CardTitle>
            <CardDescription>Proceed to your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/dashboard">Finish setup</Link></Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}


