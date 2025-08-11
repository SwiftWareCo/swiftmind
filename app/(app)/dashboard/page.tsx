import { createClient } from "@/server/supabase/server";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { getGoogleIntegrationStatus } from "@/server/integrations/tokenManager";
import { hasPermission } from "@/server/permissions/permissions.data";

export default async function DashboardPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  const supabase = await createClient();

  const [{ count: docsCount }, { data: latestJob }, { count: memberCount }] = await Promise.all([
    supabase.from("kb_docs").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
    supabase
      .from("kb_ingest_jobs")
      .select("updated_at")
      .eq("tenant_id", tenant.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ updated_at: string }>(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("tenant_id", tenant.id),
  ]);

  const gmailStatus = await getGoogleIntegrationStatus(tenant.id);
  const isAdmin = await hasPermission(tenant.id, "members.manage");

  return (
    <div className="container mx-auto max-w-6xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Knowledge</CardTitle>
            <CardDescription>{docsCount ?? 0} documents{latestJob?.updated_at ? ` • Updated ${new Date(latestJob.updated_at).toLocaleString()}` : ""}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/knowledge">Upload</Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Connections</CardTitle>
            <CardDescription>
              {gmailStatus.status === "connected" && "Gmail: Connected"}
              {gmailStatus.status === "needs_attention" && "Gmail: Needs reconnect"}
              {gmailStatus.status === "not_connected" && "Gmail: Not connected"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild><Link href="/connections">Manage</Link></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>{memberCount ?? 0} members</CardDescription>
          </CardHeader>
          <CardContent>
            {isAdmin ? (
              <Button asChild><Link href="/members">Invite</Link></Button>
            ) : (
              <div className="text-sm text-muted-foreground">Ask your admin to invite teammates.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <RecentActivity tenantId={tenant.id} />
    </div>
  );
}

async function RecentActivity({ tenantId }: { tenantId: string }) {
  const supabase = await createClient();
  const { data } = (await supabase
    .from("audit_logs")
    .select("action, resource, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(10)) as unknown as { data: { action: string; resource: string; created_at: string }[] | null };

  const rows = data ?? [];
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activity</CardTitle>
        <CardDescription>Last 10 actions</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {rows.length === 0 && <div className="text-sm text-muted-foreground">No recent activity</div>}
          {rows.map((r, i) => (
            <div key={i} className="py-2 text-sm flex items-center justify-between">
              <div>{r.action} — {r.resource}</div>
              <div className="text-muted-foreground">{new Date(r.created_at).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}


