"use server";

import { createAdminClient } from "@/server/supabase/admin";

export interface InviteInfo {
  email: string;
  tenantName: string;
  tenantSlug: string;
  roleName: string;
  roleKey: string;
  expires_at: string | null;
  revoked_at: string | null;
  accepted_at: string | null;
}

export interface InviteLookupResult {
  ok: boolean;
  error?: string;
  invite?: InviteInfo;
}

/**
 * Looks up invite information by token (admin access)
 * This is safe to call server-side for displaying tenant info on invite accept page
 */
export async function lookupInviteByToken(token: string): Promise<InviteLookupResult> {

  
  if (!token) {

    return { ok: false, error: "Missing token" };
  }

  try {
    const admin = await createAdminClient();

    
    // Fetch invite first

    const { data: invite, error: inviteError } = await admin
      .from("invites")
      .select(`
        email,
        role_key,
        expires_at,
        revoked_at,
        accepted_at,
        tenant_id
      `)
      .eq("token", token)
      .maybeSingle();

    if (inviteError) {

      return { ok: false, error: "Invalid invite" };
    }

    if (!invite) {

      return { ok: false, error: "Invite not found" };
    }



    // Fetch tenant information

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .select("name, slug")
      .eq("id", invite.tenant_id)
      .maybeSingle();

    if (tenantError || !tenant) {

      return { ok: false, error: "Invalid tenant" };
    }



    // Fetch role information

    const { data: role, error: roleError } = await admin
      .from("roles")
      .select("name")
      .eq("key", invite.role_key)
      .eq("tenant_id", invite.tenant_id)
      .maybeSingle();

    if (roleError || !role) {

      return { ok: false, error: "Invalid role" };
    }



    const result = {
      ok: true,
      invite: {
        email: invite.email,
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        roleName: role.name,
        roleKey: invite.role_key,
        expires_at: invite.expires_at,
        revoked_at: invite.revoked_at,
        accepted_at: invite.accepted_at,
      }
    };



    return result;
  } catch {
    return { ok: false, error: "Failed to lookup invite" };
  }
}

/**
 * Validates if an invite is still usable
 */
export async function validateInviteStatus(invite: InviteInfo): Promise<{ valid: boolean; reason?: string }> {
  if (invite.revoked_at) {
    return { valid: false, reason: "revoked" };
  }

  if (invite.accepted_at) {
    return { valid: false, reason: "accepted" };
  }

  if (invite.expires_at && new Date(invite.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: "expired" };
  }

  return { valid: true };
}
