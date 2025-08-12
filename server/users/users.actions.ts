"use server";

import { createClient } from "@/server/supabase/server";

export type EnsureProfileResult = { ok: boolean; error?: string };

export async function ensureUserProfileAction(
  displayName: string,
  avatarUrl?: string,
): Promise<EnsureProfileResult> {
  const name = (displayName || "").trim();
  const avatar = (avatarUrl || "").trim() || null;
  if (!name) return { ok: false, error: "Display name is required" };

  const supabase = await createClient();

  // Ensure authenticated
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) return { ok: false, error: "500" };
  if (!userData?.user) return { ok: false, error: "401" };

  // Call RPC: public.ensure_user_profile(display_name, avatar_url)
  const { error } = await supabase.rpc("ensure_user_profile", {
    display_name: name,
    avatar_url: avatar,
  }) as unknown as { error: { message: string } | null };
  if (error) {
    const msg = String(error.message || "");
    // Fallback: if RPC is missing in this environment, attempt direct upsert into public.users
    if (msg.includes("function") && msg.includes("ensure_user_profile")) {
      try {
        await supabase.from("users").upsert({
          id: userData.user.id,
          display_name: name,
          avatar_url: avatar,
        } as unknown as Record<string, unknown>);
        return { ok: true };
      } catch (e) {
        return { ok: false, error: "Missing RPC ensure_user_profile. Please create it in your database." };
      }
    }
    return { ok: false, error: msg || "Failed to save profile" };
  }
  return { ok: true };
}


