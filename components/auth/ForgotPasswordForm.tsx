"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { sendPasswordReset } from "@/server/auth/auth.actions";
import { normalizeAuthError, getPasswordResetSuccessMessage } from "@/lib/utils/auth-errors";
import { AlertCircle, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import Link from "next/link";

type ActionState = { ok: boolean; error?: string };

const initialState: ActionState = { ok: false };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(sendPasswordReset, initialState);
  const [email, setEmail] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);

  // Handle success state
  useEffect(() => {
    if (state.ok) {
      setShowSuccess(true);
    }
  }, [state.ok]);

  // Normalize error for display
  const authError = state.error ? normalizeAuthError(state.error) : null;

  // Email validation
  const emailValid = !email || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  const canSubmit = emailValid && email.length > 0;

  // Success state
  if (showSuccess) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Check your email</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {getPasswordResetSuccessMessage(email)}
            </p>
            <p className="text-xs text-muted-foreground">
              The link will expire in 1 hour for security.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={() => setShowSuccess(false)}
            variant="outline"
            className="w-full"
          >
            Send to different email
          </Button>
          
          <Button asChild variant="ghost" className="w-full">
            <Link href="/auth/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  // Form state
  return (
    <div className="space-y-6">
      {/* Error Display */}
      {authError && (
        <Alert variant="destructive" role="alert" className="border-destructive/50 bg-destructive/5">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <div className="font-medium mb-1">{authError.message}</div>
            {authError.suggestedAction && (
              <div className="text-xs text-muted-foreground">
                {authError.suggestedAction}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2 text-center">
        <h3 className="text-lg font-semibold">Reset your password</h3>
        <p className="text-sm text-muted-foreground">
          Enter your email address and we'll send you a link to reset your password.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            Email address
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="name@domain.com"
            required
            autoComplete="email"
            autoFocus
            aria-describedby={!emailValid ? "email-error" : undefined}
            aria-invalid={!emailValid}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={!emailValid ? "border-destructive focus-visible:ring-destructive/20" : ""}
          />
          {!emailValid && email.length > 0 && (
            <p id="email-error" className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Please enter a valid email address
            </p>
          )}
        </div>

        {/* Submit Button */}
        <Button 
          type="submit" 
          disabled={pending || !canSubmit} 
          className="w-full"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending reset link...
            </>
          ) : (
            "Send reset link"
          )}
        </Button>

        {/* Back to Login */}
        <div className="text-center pt-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/auth/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to login
            </Link>
          </Button>
        </div>
      </form>
    </div>
  );
}