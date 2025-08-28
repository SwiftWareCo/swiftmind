import { redirect } from "next/navigation";
import { createClient } from "@/server/supabase/server";
import { AuthShell, AuthPanelShell } from "@/components/auth/AuthShell";
import { InviteAcceptForm } from "@/components/auth/InviteAcceptForm";
import { lookupInviteByToken, validateInviteStatus } from "@/server/auth/invite-lookup";
import { AlertCircle, UserX, Clock, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function InviteAcceptPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ token?: string }> 
}) {
  const { token } = await searchParams;
  
  if (!token) {
    return (
      <AuthPanelShell title="Invalid invitation" variant="error">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Missing invitation token</p>
            <p className="text-xs text-muted-foreground">
              The invitation link appears to be incomplete or invalid.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="mailto:support@swiftmind.app">Contact support</Link>
          </Button>
        </div>
      </AuthPanelShell>
    );
  }

  // Look up invitation details
  const inviteResult = await lookupInviteByToken(token);
  
  if (!inviteResult.ok || !inviteResult.invite) {
    return (
      <AuthPanelShell title="Invitation not found" variant="error">
        <div className="text-center space-y-4">
          <UserX className="h-12 w-12 text-destructive mx-auto" />
          <div className="space-y-2">
            <p className="text-sm font-medium">This invitation could not be found</p>
            <p className="text-xs text-muted-foreground">
              The invitation may have been removed or the link may be incorrect.
            </p>
          </div>
          <Button asChild variant="outline" className="w-full">
            <Link href="mailto:support@swiftmind.app">Contact support</Link>
          </Button>
        </div>
      </AuthPanelShell>
    );
  }

  const invite = inviteResult.invite;
  const validation = await validateInviteStatus(invite);

  // Handle invalid invite states
  if (!validation.valid) {
    const { reason } = validation;
    
    if (reason === "revoked") {
      return (
        <AuthPanelShell title="Invitation revoked" variant="error">
          <div className="text-center space-y-4">
            <UserX className="h-12 w-12 text-destructive mx-auto" />
            <div className="space-y-2">
              <p className="text-sm font-medium">This invitation has been revoked</p>
              <p className="text-xs text-muted-foreground">
                The invitation to join {invite.tenantName} is no longer valid.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="mailto:support@swiftmind.app">Contact admin</Link>
            </Button>
          </div>
        </AuthPanelShell>
      );
    }

    if (reason === "expired") {
      return (
        <AuthPanelShell title="Invitation expired" variant="error">
          <div className="text-center space-y-4">
            <Clock className="h-12 w-12 text-amber-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-sm font-medium">This invitation has expired</p>
              <p className="text-xs text-muted-foreground">
                The invitation to join {invite.tenantName} is no longer valid.
              </p>
            </div>
            <Button asChild className="w-full">
              <Link href="mailto:support@swiftmind.app">Request new invitation</Link>
            </Button>
          </div>
        </AuthPanelShell>
      );
    }

    if (reason === "accepted") {
      // Check if user is signed in but with different email
      const supabase = await createClient();
      const { data: { user } } = await supabase.auth.getUser();
      
      return (
        <AuthPanelShell title="Invitation already used" variant="success">
          <div className="text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <div className="space-y-2">
              <p className="text-sm font-medium">This invitation has already been accepted</p>
              <p className="text-xs text-muted-foreground">
                You&apos;re already a member of {invite.tenantName}.
              </p>
              {user && user.email?.toLowerCase() !== invite.email.toLowerCase() ? (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  You&apos;re signed in as {user.email}, but this invite was for {invite.email}.
                </p>
              ) : null}
            </div>
            <Button asChild className="w-full">
              <Link href="/auth/login">Sign in as {invite.email}</Link>
            </Button>
          </div>
        </AuthPanelShell>
      );
    }
  }

  // Check if user is already signed in
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const isNewUser = !user;

  // If invite is already accepted and user is signed in with matching email, 
  // auto-redirect to tenant dashboard
  if (validation.reason === "accepted" && user && user.email?.toLowerCase() === invite.email.toLowerCase()) {
    const { buildTenantUrl } = await import("@/lib/utils/tenant");
    const dashboardUrl = await buildTenantUrl(invite.tenantSlug, "/dashboard");
    redirect(dashboardUrl);
  }

  // Get current user's display name if they exist
  let initialDisplayName = "";
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string | null }>();
    initialDisplayName = profile?.display_name ?? "";
  }

  // Check if signed-in user's email matches invite email
  if (user && user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return (
      <AuthPanelShell title="Email mismatch" variant="error">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <div className="space-y-2">
            <p className="text-sm font-medium">This invitation is for a different email</p>
            <p className="text-xs text-muted-foreground">
              You&apos;re signed in as <strong>{user.email}</strong>, but this invitation is for <strong>{invite.email}</strong>.
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" className="flex-1">
              <Link href="/auth/login">Sign out & try again</Link>
            </Button>
            <Button asChild className="flex-1">
              <Link href="mailto:support@swiftmind.app">Get help</Link>
            </Button>
          </div>
        </div>
      </AuthPanelShell>
    );
  }

  // Valid invitation - show accept form
  return (
    <AuthShell
      title="Join workspace"
      subtitle={`You've been invited to join ${invite.tenantName}`}
      tenantInfo={{
        name: invite.tenantName,
        role: invite.roleName
      }}
      showSupportLink={true}
    >
      <InviteAcceptForm
        token={token}
        isNewUser={isNewUser}
        initialDisplayName={initialDisplayName}
      />
    </AuthShell>
  );
}