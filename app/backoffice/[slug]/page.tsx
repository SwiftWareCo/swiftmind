import { requirePlatformAdmin } from "@/server/platform/platform-admin.data";
import { getTenantDetailBySlug } from "@/server/tenants/tenants.data";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";

export default async function BackofficeTenantDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  await requirePlatformAdmin();
  const { slug } = await params;
  const t = await getTenantDetailBySlug(slug);

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Tenant: {t.name}</h1>
        <p className="text-sm text-muted-foreground">Slug: {t.slug} · Created: {new Date(t.created_at).toLocaleString()}</p>
        <div className="mt-2"><Link className="underline" href="/backoffice">Back to list</Link></div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Members</CardTitle>
            <CardDescription>Read-only membership list</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.members.map((m) => (
                  <TableRow key={m.user_id}>
                    <TableCell>{m.email}</TableCell>
                    <TableCell>{m.display_name || "—"}</TableCell>
                    <TableCell>{m.role_key}</TableCell>
                    <TableCell>{new Date(m.created_at).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Invites</CardTitle>
            <CardDescription>Pending and historical invites</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>Accepted</TableHead>
                  <TableHead>Revoked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.invites.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.email}</TableCell>
                    <TableCell>{i.role_key}</TableCell>
                    <TableCell>{new Date(i.created_at).toLocaleString()}</TableCell>
                    <TableCell>{i.expires_at ? new Date(i.expires_at).toLocaleString() : "—"}</TableCell>
                    <TableCell>{i.accepted_at ? new Date(i.accepted_at).toLocaleString() : "—"}</TableCell>
                    <TableCell>{i.revoked_at ? new Date(i.revoked_at).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Connections</CardTitle>
          <CardDescription>Integration statuses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm">Gmail: {t.integrations.gmail.status === "connected" ? `Connected${t.integrations.gmail.updated_at ? ` (updated ${new Date(t.integrations.gmail.updated_at).toLocaleString()})` : ""}` : t.integrations.gmail.status === "needs_attention" ? "Needs attention" : "Not connected"}</div>
        </CardContent>
      </Card>
    </div>
  );
}


