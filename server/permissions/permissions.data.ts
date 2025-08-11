"use server";

import { createClient } from "@/server/supabase/server";

export async function hasPermission(tenantId: string, perm: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = (await supabase.rpc("user_has_permission", { t: tenantId, perm })) as {
    data: boolean | null;
    error: { message: string } | null;
  };
  if (error) return false;
  return Boolean(data);
}


