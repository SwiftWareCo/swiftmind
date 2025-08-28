"use server";

import { createClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { requirePlatformAdmin } from "@/server/platform/platform-admin.data";
import type { Tables, TablesInsert } from "@/lib/types/database.types";
import { revalidatePath } from "next/cache";

export type AcceptInviteResult = { ok: boolean; error?: string; tenant_slug?: string };

export type CreateTenantResult = {
  ok: boolean;
  error?: string;
  tenant?: Pick<Tables<"tenants">, "id" | "name" | "slug">;
  createdAdmin?: { 
    userId: string; 
    email: string; 
    temporaryPassword?: string;
    inviteLink?: string;
    method?: "temporary_password" | "invitation_link" | "existing_user";
  };
};

export async function acceptInviteAction(token: string, displayName?: string): Promise<AcceptInviteResult> {
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!user) return { ok: false, error: "401" };

  const dn = (displayName || "").trim();
  const { data, error } = await supabase
    .rpc("accept_tenant_invite", { p_token: token, p_display_name: dn || null });

  if (error) return { ok: false, error: error.message };
  const slug = (data as { tenant_slug?: string } | null)?.tenant_slug;
  if (!slug) return { ok: false, error: "Missing tenant slug" };
  return { ok: true, tenant_slug: slug };
}

export async function createTenantAction(
  name: string, 
  slug: string, 
  initialAdminEmail?: string,
  adminMethod: "invitation_link" | "temporary_password" = "invitation_link"
): Promise<CreateTenantResult> {
  await requirePlatformAdmin();

  const n = (name || "").trim();
  const s = (slug || "").trim().toLowerCase();
  if (!n || !s) return { ok: false, error: "Missing input" };

  const admin = await createAdminClient();

  // 1) Create tenant
  const { data: tenantRow, error: tenantErr } = await admin
    .from("tenants")
    .insert({ name: n, slug: s } as unknown as TablesInsert<"tenants">)
    .select("id, name, slug")
    .maybeSingle<Pick<Tables<"tenants">, "id" | "name" | "slug">>();
  if (tenantErr) return { ok: false, error: tenantErr.message };
  if (!tenantRow) return { ok: false, error: "Failed to create tenant" };

  const tenantId = tenantRow.id;

  // 2) Seed roles
  const defaultRoles: Array<{ key: string; name: string; description?: string | null }> = [
    { key: "admin", name: "Admin", description: "Full access" },
    { key: "operations", name: "Operations", description: "Operational tasks" },
    { key: "member", name: "Member", description: "Default member" },
  ];
  for (const r of defaultRoles) {
    await admin.from("roles").upsert({
      tenant_id: tenantId,
      key: r.key,
      name: r.name,
      description: r.description ?? null,
    } as unknown as TablesInsert<"roles">, { onConflict: "tenant_id,key" } as unknown as { onConflict: string });
  }

  // 3) Seed permissions for roles
  // Grant all permissions to admin
  const { data: perms } = await admin.from("permissions").select("key");
  const allPermKeys = (perms || []).map((p: { key: string }) => p.key);
  for (const p of allPermKeys) {
    await admin.from("role_permissions").upsert({
      tenant_id: tenantId,
      role_key: "admin",
      permission_key: p,
    } as unknown as TablesInsert<"role_permissions">, { onConflict: "tenant_id,role_key,permission_key" } as unknown as { onConflict: string });
  }
  // Grant email.send to operations if it exists
  if (allPermKeys.includes("email.send")) {
    await admin.from("role_permissions").upsert({
      tenant_id: tenantId,
      role_key: "operations",
      permission_key: "email.send",
    } as unknown as TablesInsert<"role_permissions">, { onConflict: "tenant_id,role_key,permission_key" } as unknown as { onConflict: string });
  }

  // 4) Optional initial admin setup
  if (initialAdminEmail) {
    const { setupInitialTenantAdmin } = await import("@/server/auth/initial-admin-setup");
    const adminSetup = await setupInitialTenantAdmin(tenantId, initialAdminEmail, adminMethod);
    
    if (adminSetup.ok) {
      revalidatePath("/backoffice");
      return { 
        ok: true, 
        tenant: tenantRow, 
        createdAdmin: adminSetup.credentials ? {
          userId: "", // We don't need to expose internal user ID
          email: adminSetup.credentials.email,
          temporaryPassword: adminSetup.credentials.temporaryPassword,
          inviteLink: adminSetup.credentials.inviteLink,
          method: adminSetup.method
        } : undefined
      };
    } else {
      // Continue without admin setup if it fails
      console.error("Failed to setup initial admin:", adminSetup.error);
    }
  }

  revalidatePath("/backoffice");
  return { ok: true, tenant: tenantRow };
}

