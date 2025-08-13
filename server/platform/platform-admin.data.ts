"use server";

import "server-only";

import { createClient } from "@/server/supabase/server";

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) return false;

  const { data, error } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle<{ user_id: string }>();
  if (error) return false;
  return !!data?.user_id;
}

export async function requirePlatformAdmin(): Promise<void> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("401");
  const ok = await isPlatformAdmin();
  if (!ok) throw new Error("403");
}


