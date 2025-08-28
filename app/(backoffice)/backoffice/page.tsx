import { requirePlatformAdmin } from "@/server/platform/platform-admin.data";
import { listTenantsWithMemberCounts } from "@/server/tenants/tenants.data";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { EnhancedCreateTenantForm } from "@/components/backoffice/EnhancedCreateTenantForm";

export default async function BackofficePage() {
  await requirePlatformAdmin();

  const tenants = await listTenantsWithMemberCounts();

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Backoffice</h1>
        <p className="text-sm text-muted-foreground">Operator-only console to create tenants and view platform data.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create Tenant</CardTitle>
          <CardDescription>Provision a new tenant and optionally seed an initial admin membership.</CardDescription>
        </CardHeader>
        <CardContent>
          <EnhancedCreateTenantForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenants</CardTitle>
          <CardDescription>All tenants in the system</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Detail</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((t) => (
                <TableRow key={t.id}>
                  <TableCell>{t.name}</TableCell>
                  <TableCell>{t.slug}</TableCell>
                  <TableCell>{new Date(t.created_at).toLocaleString()}</TableCell>
                  <TableCell>{t.member_count}</TableCell>
                  <TableCell>
                    <Link className="underline" href={`/backoffice/${t.slug}`}>View</Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


