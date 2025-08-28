"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/server/supabase/server";

type ActionResult = {
  ok: boolean;
  error?: string;
};

async function getSiteUrl(): Promise<string> {
  const hdrs = await headers();
  // Prefer explicit env if provided
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost:3000";
  const proto = (hdrs.get("x-forwarded-proto") ?? "http").split(",")[0];
  return `${proto}://${host}`.replace(/\/$/, "");
}

export async function signInWithPassword(prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();

  if (!email || !password) {
    return { ok: false, error: "Email and password are required" };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}

export async function signUpWithPassword(prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "").trim();
  const confirm = String(formData.get("confirm_password") ?? "").trim();

  if (!email || !password) {
    return { ok: false, error: "Email and password are required" };
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords do not match" };
  }
  if (password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  if (!emailRegex.test(email)) {
    return { ok: false, error: "Please enter a valid email address" };
  }

  const supabase = await createClient();

  const siteUrl = await getSiteUrl();
  // After confirmation, send new users to /no-access since they have 0 memberships
  const emailRedirectTo = `${siteUrl}/auth/confirm?next=/no-access`;

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo },
  });

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function sendPasswordReset(prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Email is required" };

  const supabase = await createClient();

  const siteUrl = await getSiteUrl();
  const redirectTo = `${siteUrl}/auth/confirm?type=recovery&next=/auth/update-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updatePassword(prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const newPassword = String(formData.get("password") ?? "").trim();
  if (!newPassword) return { ok: false, error: "Password is required" };

  const supabase = await createClient();

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}

export async function resendConfirmationEmail(prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Email is required" };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  
  // Use the same redirect URL as signup
  const emailRedirectTo = `${siteUrl}/auth/confirm?next=/dashboard`;
  
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo }
  });
  
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resendPasswordResetEmail(prevState: ActionResult | undefined, formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { ok: false, error: "Email is required" };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const redirectTo = `${siteUrl}/auth/confirm?type=recovery&next=/auth/update-password`;
  
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}


