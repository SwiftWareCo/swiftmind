"use server";

import { createClient } from "@/server/supabase/server";
import { isPlatformAdmin } from "@/server/platform/platform-admin.data";

export async function hasPermission(tenantId: string, perm: string): Promise<boolean> {
  // Platform admins have all permissions
  const isAdmin = await isPlatformAdmin();
  if (isAdmin) {
    return true;
  }

  const supabase = await createClient();
  const { data, error } = (await supabase.rpc("user_has_permission", { t: tenantId, perm })) as {
    data: boolean | null;
    error: { message: string } | null;
  };
  if (error) return false;
  return Boolean(data);
}


