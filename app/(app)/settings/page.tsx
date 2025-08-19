import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/permissions/permissions.data";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RolesTab } from "@/components/settings/RolesTab";
import { AssistantPromptSection } from "@/components/settings/AssistantPromptSection";
import { RagControlsSection } from "@/components/settings/RagControlsSection";

export default async function SettingsPage() {
  const slug = await getTenantSlug();
  if (!slug) throw new Error("Tenant not found");
  const tenant = await getTenantBySlug(slug);
  const isAdmin = await hasPermission(tenant.id, "members.manage");

  return (
    <div className=" space-y-4">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <Tabs defaultValue="assistant">
        <TabsList>
          <TabsTrigger className="hover:cursor-pointer" value="assistant">Assistant</TabsTrigger>
          <TabsTrigger className="hover:cursor-pointer" value="rag">RAG</TabsTrigger>
          <TabsTrigger className="hover:cursor-pointer" value="roles">Roles</TabsTrigger>
        </TabsList>
        <TabsContent value="assistant">
          <AssistantPromptSection tenantId={tenant.id} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="rag">
          <RagControlsSection tenantId={tenant.id} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="roles">
          <RolesTab tenantId={tenant.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


