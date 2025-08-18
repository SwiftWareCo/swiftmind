export const dynamic = "force-dynamic";
import { requirePlatformAdmin } from "@/server/platform/platform-admin.data";
import { listBackofficeRestSourcesWithCursor } from "@/server/rest/rest.data";
import { deleteRestSourceAction } from "@/server/rest/rest.actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { SyncButton } from "./sync-button";
import { DeleteButton } from "@/components/ui/DeleteButton";

export default async function RestSourcesBackofficePage() {
  await requirePlatformAdmin();

  const rows = await listBackofficeRestSourcesWithCursor();


  async function deleteServer(formData: FormData): Promise<void> {
    "use server";
    await requirePlatformAdmin();
    await deleteRestSourceAction(formData);
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-semibold mb-4">Backoffice — REST Sources</h1>
        <p className="text-sm text-muted-foreground">Operator-only: run small resumable batches to sync REST sources and manage them.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>REST Sources</CardTitle>
          <CardDescription>Sources marked backoffice-only. Each batch will fetch a single page and ingest chunks.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Next Cursor</TableHead>
                <TableHead>Metrics</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const cursor = r.cursor;
                const done = cursor ? cursor.next_cursor == null : false;
                return (
                  <TableRow key={r.source.id}>
                    <TableCell>
                      <div className="font-medium">{r.source.title}</div>
                      <div className="text-xs text-muted-foreground">{r.source.id}</div>
                    </TableCell>
                    <TableCell>
                      <div>{r.tenant?.name ?? "?"}</div>
                      <div className="text-xs text-muted-foreground">{r.tenant?.slug ?? r.source.tenant_id}</div>
                    </TableCell>
                    <TableCell>
                      {cursor ? (cursor.next_cursor ?? "Completed") : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">pages: {cursor?.page_count ?? 0}</div>
                      <div className="text-sm">items: {cursor?.item_count ?? 0}</div>
                      <div className="text-xs text-muted-foreground">{cursor?.last_synced_at ? new Date(cursor.last_synced_at).toLocaleString() : "never"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{cursor?.last_status ?? "—"}{cursor?.last_http_status ? ` (${cursor.last_http_status})` : ""}</div>
                      {cursor?.last_error ? (<div className="text-xs text-destructive mt-1 max-w-[320px] truncate" title={cursor.last_error}>{cursor.last_error}</div>) : null}
                    </TableCell>
                    <TableCell className="space-x-2">
                      <SyncButton sourceId={r.source.id} done={done} />
                      <form id={`delete-${r.source.id}`} action={deleteServer} className="inline">
                        <input type="hidden" name="sourceId" value={r.source.id} />
                        <DeleteButton
                          label="Delete"
                          title="Delete source?"
                          description="This will remove all docs and chunks created from this source. This action cannot be undone."
                          formId={`delete-${r.source.id}`}
                        />
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}


