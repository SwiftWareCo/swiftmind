"use server";

import { createClient } from "@/server/supabase/server";

export type InviteRow = {
  id: string;
  email: string;
  role_key: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  accepted_at: string | null;
  revoked_at: string | null;
};

export async function listInvites(tenantId: string): Promise<InviteRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invites")
    .select("id, email, role_key, token, created_at, expires_at, accepted_at, revoked_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []) as unknown as InviteRow[];
}


