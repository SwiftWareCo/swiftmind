"use client";

import { useState, useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { AuthPanelShell } from "@/components/auth/AuthShell";
import { resendConfirmationEmail, resendPasswordResetEmail } from "@/server/auth/auth.actions";
import { normalizeAuthError, canResendEmail, getRateLimitTimeout } from "@/lib/utils/auth-errors";
import { CheckCircle, Clock, AlertCircle, Mail, Loader2 } from "lucide-react";

type ConfirmationState = "success" | "expired" | "error" | "resend" | "loading";
type ConfirmationType = "signup" | "recovery" | "invite";

interface Props {
  type: ConfirmationType;
  error?: string;
  success?: boolean;
  next?: string;
}

type ActionState = { ok: boolean; error?: string };
const initialState: ActionState = { ok: false };

export function ConfirmPageClient({ type, error, success, next }: Props) {
  const [confirmState, setConfirmState] = useState<ConfirmationState>(
    success ? "success" : error ? (canResendEmail(error) ? "expired" : "error") : "success"
  );
  const [email, setEmail] = useState("");
  const [countdown, setCountdown] = useState(0);

  // Choose the appropriate resend action based on type
  const resendAction = type === "recovery" ? resendPasswordResetEmail : resendConfirmationEmail;
  const [resendState, resendFormAction, resendPending] = useActionState<ActionState, FormData>(resendAction, initialState);

  // Handle resend success
  useEffect(() => {
    if (resendState.ok) {
      setConfirmState("success");
      setCountdown(60); // 60 second cooldown
    }
  }, [resendState.ok]);

  // Countdown timer
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Handle rate limiting
  useEffect(() => {
    if (resendState.error) {
      const timeout = getRateLimitTimeout(resendState.error);
      if (timeout > 0) {
        setCountdown(timeout);
      }
    }
  }, [resendState.error]);

  const resendError = resendState.error ? normalizeAuthError(resendState.error) : null;
  const confirmError = error ? normalizeAuthError(error) : null;

  const getTitle = () => {
    switch (confirmState) {
      case "success":
        return "Check your email";
      case "expired":
        return "Link expired";
      case "error":
        return "Confirmation failed";
      case "resend":
        return "Resend confirmation";
      default:
        return "Email confirmation";
    }
  };

  const getIcon = () => {
    switch (confirmState) {
      case "success":
        return <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />;
      case "expired":
      case "error":
        return <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />;
      case "resend":
        return <Mail className="h-12 w-12 text-blue-500 mx-auto mb-4" />;
      default:
        return <Clock className="h-12 w-12 text-muted-foreground mx-auto mb-4" />;
    }
  };

  // Success state
  if (confirmState === "success" && !resendState.error) {
    return (
      <AuthPanelShell title={getTitle()} variant="success">
        <div className="text-center space-y-4">
          {getIcon()}
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {type === "recovery" 
                ? "We've sent you a password reset link."
                : "We've sent you a confirmation link."
              }
            </p>
            <p className="text-xs text-muted-foreground">
              Check your email and spam folder, then click the link to continue.
            </p>
            {next && (
              <Badge variant="secondary" className="text-xs">
                Redirects to: {next.replace(/^\//, "")}
              </Badge>
            )}
          </div>

          {/* Resend option with cooldown */}
          <div className="pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground mb-3">
              Didn&apos;t receive the email?
            </p>
            
            {countdown > 0 ? (
              <Button variant="outline" disabled className="w-full">
                <Clock className="mr-2 h-4 w-4" />
                Resend in {countdown}s
              </Button>
            ) : (
              <Button 
                variant="outline" 
                onClick={() => setConfirmState("resend")}
                className="w-full"
              >
                Resend email
              </Button>
            )}
          </div>
        </div>
      </AuthPanelShell>
    );
  }

  // Error state
  if (confirmState === "error") {
    return (
      <AuthPanelShell title={getTitle()} variant="error">
        <div className="text-center space-y-4">
          {getIcon()}
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {confirmError?.message || "Something went wrong during confirmation."}
            </p>
            {confirmError?.suggestedAction && (
              <p className="text-xs text-muted-foreground">
                {confirmError.suggestedAction}
              </p>
            )}
          </div>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setConfirmState("resend")}
              className="flex-1"
            >
              Try again
            </Button>
            <Button asChild className="flex-1">
              <a href="/auth/login">Back to login</a>
            </Button>
          </div>
        </div>
      </AuthPanelShell>
    );
  }

  // Expired link state
  if (confirmState === "expired") {
    return (
      <AuthPanelShell title={getTitle()} variant="error">
        <div className="text-center space-y-4">
          {getIcon()}
          <div className="space-y-2">
            <p className="text-sm font-medium">
              This confirmation link has expired or is no longer valid.
            </p>
            <p className="text-xs text-muted-foreground">
              Don&apos;t worry – we can send you a fresh link.
            </p>
          </div>
          
          <Button 
            onClick={() => setConfirmState("resend")}
            className="w-full"
          >
            Get new link
          </Button>
        </div>
      </AuthPanelShell>
    );
  }

  // Resend form state
  return (
    <AuthPanelShell title={getTitle()}>
      <div className="space-y-4">
        {getIcon()}
        
        {resendError && (
          <Alert variant="destructive" role="alert">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="font-medium mb-1">{resendError.message}</div>
              {resendError.suggestedAction && (
                <div className="text-xs text-muted-foreground">
                  {resendError.suggestedAction}
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <p className="text-sm text-center text-muted-foreground">
            Enter your email address to receive a new {type === "recovery" ? "password reset" : "confirmation"} link.
          </p>
        </div>

        <form action={resendFormAction} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="resend-email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="resend-email"
              name="email"
              type="email"
              placeholder="name@domain.com"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={resendPending || countdown > 0}
            />
          </div>

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmState("success")}
              className="flex-1"
              disabled={resendPending}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={resendPending || !email || countdown > 0}
              className="flex-1"
            >
              {resendPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : countdown > 0 ? (
                `Wait ${countdown}s`
              ) : (
                "Send link"
              )}
            </Button>
          </div>
        </form>
      </div>
    </AuthPanelShell>
  );
}
