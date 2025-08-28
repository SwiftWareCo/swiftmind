
import "server-only";

/**
 * Server-only permission guard.
 *
 * Usage: await requirePermission(tenantId, "templates.edit");
 * - Throws Error("401") if unauthenticated
 * - Throws Error("403") if user lacks permission
 * - Throws Error("500") if RPC fails or SQL wrapper is missing
 */
import { createClient } from "@/server/supabase/server";
import { isPlatformAdmin } from "@/server/platform/platform-admin.data";

export async function requirePermission(tenantId: string, perm: string): Promise<void> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    console.error(userError);
    throw new Error("500");
  }
  if (!user) {
    throw new Error("401");
  }

  // Platform admins bypass all permission checks
  const isAdmin = await isPlatformAdmin();
  if (isAdmin) {
    return; // Platform admin has all permissions
  }

  const { data, error } = await supabase.rpc("user_has_permission", {
    t: tenantId,
    perm,
  }) as { data: boolean | null; error: { message: string } | null };

  if (error) {
    console.error(
      "Supabase RPC error calling public.user_has_permission. Ensure a SQL wrapper exists: CREATE OR REPLACE FUNCTION public.user_has_permission(t uuid, perm text) RETURNS boolean ...;",
      error
    );
    throw new Error("500");
  }

  if (!data) {
    throw new Error("403");
  }
}


