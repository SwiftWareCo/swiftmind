"use server";

import { createAdminClient } from "@/server/supabase/admin";
import { createInviteAction } from "@/server/memberships/invites.actions";
import { TablesInsert } from "@/lib/types/database.types";

export interface InitialAdminSetupResult {
  ok: boolean;
  error?: string;
  method: "temporary_password" | "invitation_link" | "existing_user";
  credentials?: {
    email: string;
    temporaryPassword?: string;
    inviteLink?: string;
  };
}

/**
 * Enhanced initial admin setup with better UX options
 * Provides multiple ways to onboard the first tenant admin
 */
export async function setupInitialTenantAdmin(
  tenantId: string,
  adminEmail: string,
  method: "temporary_password" | "invitation_link" = "invitation_link"
): Promise<InitialAdminSetupResult> {
  
  if (!tenantId || !adminEmail) {
    return { ok: false, error: "Missing required parameters", method };
  }

  // Verify environment variables
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error("SUPABASE_SERVICE_ROLE_KEY environment variable is not set");
    return { ok: false, error: "Service configuration error - missing admin key", method };
  }

  const email = adminEmail.trim().toLowerCase();
  const admin = await createAdminClient();

  try {
    // Check if user already exists by searching for their profile
    let existingUser = null;
    const { data: userProfile, error: profileError } = await admin
      .from("users")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    
    if (profileError) {
      console.error("Error checking user profile:", profileError);
    }
    
    if (userProfile) {
      // Get the auth user by ID
      const { data: authUser, error: authError } = await admin.auth.admin.getUserById(userProfile.id);
      if (authError) {
        console.error("Error getting auth user:", authError);
      }
      existingUser = authUser?.user || null;
    }

    if (existingUser) {
      // User exists - just add them as admin
      const { error: membershipError } = await admin.from("memberships").upsert({
        tenant_id: tenantId,
        user_id: existingUser.id,
        role_key: "admin",
      } as unknown as TablesInsert<"memberships">, { onConflict: "tenant_id,user_id" } as unknown as { onConflict: string });

      if (membershipError) {
        console.error("Error creating membership:", membershipError);
        return { ok: false, error: `Failed to create membership: ${membershipError.message}`, method };
      }

      return {
        ok: true,
        method: "existing_user",
        credentials: { email }
      };
    }

    // User doesn't exist - choose method
    if (method === "temporary_password") {
      // Method 1: Create user with temporary password (current approach)
      const temporaryPassword = generateSecurePassword();
      
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
      } as unknown as { email: string; password: string; email_confirm?: boolean });

      if (createError) {
        console.error("Error creating user:", createError);
        return { ok: false, error: `Failed to create user: ${createError.message}`, method };
      }

      if (!created?.user?.id) {
        return { ok: false, error: "Failed to create admin user - no user ID returned", method };
      }

      const { error: membershipError } = await admin.from("memberships").upsert({
        tenant_id: tenantId,
        user_id: created.user.id,
        role_key: "admin",
      } as unknown as TablesInsert<"memberships">, { onConflict: "tenant_id,user_id" } as unknown as { onConflict: string });

      if (membershipError) {
        console.error("Error creating membership for new user:", membershipError);
        return { ok: false, error: `Failed to create membership: ${membershipError.message}`, method };
      }

      return {
        ok: true,
        method: "temporary_password",
        credentials: { email, temporaryPassword }
      };

    } else {
      // Method 2: Send invitation link (recommended)
      // Create a special "admin invite" that pre-creates the membership
      const inviteResult = await createInviteAction(tenantId, email, "admin");
      
      if (!inviteResult.ok || !inviteResult.link) {
        return { ok: false, error: inviteResult.error || "Failed to create invite", method };
      }

      return {
        ok: true,
        method: "invitation_link",
        credentials: { email, inviteLink: inviteResult.link }
      };
    }

  } catch (error) {
    console.error("Error setting up initial admin:", error);
    return { ok: false, error: "Failed to setup initial admin", method };
  }
}

/**
 * Generate a secure temporary password
 */
function generateSecurePassword(): string {
  const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lowercase = "abcdefghijklmnopqrstuvwxyz";
  const numbers = "0123456789";
  const symbols = "!@#$%^&*";
  
  const getRandomChar = (charset: string) => 
    charset[Math.floor(Math.random() * charset.length)];
  
  // Ensure at least one of each type
  const password = [
    getRandomChar(uppercase),
    getRandomChar(lowercase),
    getRandomChar(numbers),
    getRandomChar(symbols)
  ];
  
  // Fill remaining 8 characters randomly
  const allChars = uppercase + lowercase + numbers + symbols;
  for (let i = 4; i < 12; i++) {
    password.push(getRandomChar(allChars));
  }
  
  // Shuffle the password
  return password.sort(() => Math.random() - 0.5).join('');
}
