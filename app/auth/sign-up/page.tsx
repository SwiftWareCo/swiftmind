import { AuthPanelShell } from "@/components/auth/AuthShell";
import { Button } from "@/components/ui/button";
import { UserPlus, Mail, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function SignUpPage() {
  // Check if invite-only mode is enabled
  const isInviteOnly = process.env.NEXT_PUBLIC_INVITE_ONLY_MODE === "true";

  if (isInviteOnly) {
    return (
      <AuthPanelShell title="Invite required">
        <div className="text-center space-y-6">
          <div className="mx-auto w-16 h-16 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
            <UserPlus className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">This workspace is invite-only</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              New accounts can only be created through invitations. If you've been invited to join a workspace, 
              please use the invitation link you received.
            </p>
          </div>

          <div className="space-y-3">
            <div className="p-4 rounded-lg bg-muted/50 border border-border/50">
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="text-left">
                  <p className="text-sm font-medium">Need an invitation?</p>
                  <p className="text-xs text-muted-foreground">
                    Contact your workspace administrator or team lead to request access.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button asChild variant="outline" className="flex-1">
                <Link href="/auth/login">
                  Sign in instead
                </Link>
              </Button>
              <Button asChild className="flex-1">
                <Link href="mailto:support@swiftmind.app">
                  Request access
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>

          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground">
              If you have an invitation link, please click it directly or copy the full URL into your browser.
            </p>
          </div>
        </div>
      </AuthPanelShell>
    );
  }

  // For non-invite-only mode, would show regular signup form
  // This is a placeholder - you can implement the full signup form here
  return (
    <AuthPanelShell title="Create account">
      <div className="text-center space-y-4">
        <p className="text-sm text-muted-foreground">
          Public signup is currently disabled. Please contact support for access.
        </p>
        <Button asChild className="w-full">
          <Link href="mailto:support@swiftmind.app">Contact support</Link>
        </Button>
      </div>
    </AuthPanelShell>
  );
}
