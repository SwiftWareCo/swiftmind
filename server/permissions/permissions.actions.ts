"use server";

import "server-only";

import { createClient } from "@/server/supabase/server";
import type { TablesInsert } from "@/lib/types/database.types";

const EMAIL_SEND_KEY = "email.send";

export async function ensureEmailPermissionProvisionedForTenant(tenantId: string): Promise<void> {
  const supabase = await createClient();

  // Upsert permission definition
  await supabase.from("permissions").upsert({
    key: EMAIL_SEND_KEY,
    description: "Send email via providers",
  } as unknown as TablesInsert<"permissions">);

  // Grant to admin and operations roles by default for the tenant
  const defaultRoles = ["admin", "operations"];
  for (const role of defaultRoles) {
    await supabase.from("role_permissions").upsert({
      tenant_id: tenantId,
      role_key: role,
      permission_key: EMAIL_SEND_KEY,
    } as unknown as TablesInsert<"role_permissions">);
  }
}


