"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { signInWithPassword } from "@/server/auth/auth.actions";
import { normalizeAuthError } from "@/lib/utils/auth-errors";
import { Eye, EyeOff, AlertCircle, Loader2 } from "lucide-react";
import { useErrorFocus, useScreenReaderAnnouncement, useFormFieldIds } from "@/lib/utils/accessibility";

type ActionState = { ok: boolean; error?: string };

const initialState: ActionState = { ok: false };

export function LoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signInWithPassword, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isRedirecting, setIsRedirecting] = useState(false);
  
  // Accessibility hooks
  const { announce, AnnouncementRegion } = useScreenReaderAnnouncement();
  const emailIds = useFormFieldIds("login-email");
  const passwordIds = useFormFieldIds("login-password");
  const errorRef = useErrorFocus<HTMLDivElement>(!!state.error);
  
  // Client-side validation
  const emailValid = useMemo(() => {
    if (!email) return true; // Don't show error for empty field
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
  }, [email]);

  const canSubmit = emailValid && email.length > 0 && password.length > 0;
  const isLoading = pending || isRedirecting;

  // Handle success
  useEffect(() => {
    if (state.ok) {
      setIsRedirecting(true);
      announce("Sign in successful. Redirecting...", "assertive");
      // Let the server-side routing (middleware/layout) handle the redirect
      // Platform admins will go to /backoffice, regular users to their tenant dashboard
      router.replace("/");
    }
  }, [state.ok, router, announce]);

  // Announce errors to screen readers
  useEffect(() => {
    if (state.error) {
      const authError = normalizeAuthError(state.error);
      announce(`Sign in error: ${authError.message}`, "assertive");
    }
  }, [state.error, announce]);

  // Normalize error for display
  const authError = state.error ? normalizeAuthError(state.error) : null;

  return (
    <div className="space-y-6">
      {/* Screen reader announcement region */}
      <AnnouncementRegion />
      
      {/* Error Display */}
      {authError && (
        <Alert 
          ref={errorRef}
          variant="destructive" 
          role="alert" 
          className="border-destructive/50 bg-destructive/5"
          tabIndex={-1}
          aria-labelledby="error-title"
          aria-describedby="error-description"
        >
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          <AlertDescription className="text-sm">
            <div id="error-title" className="font-medium mb-1">{authError.message}</div>
            {authError.suggestedAction && (
              <div id="error-description" className="text-xs text-muted-foreground">
                {authError.suggestedAction}
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="space-y-4">
        {/* Email Field */}
        <div className="space-y-2">
          <label 
            htmlFor={emailIds.fieldId} 
            id={emailIds.labelId}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Email
          </label>
          <Input
            id={emailIds.fieldId}
            name="email"
            type="email"
            placeholder="name@domain.com"
            required
            autoComplete="email"
            autoFocus
            aria-labelledby={emailIds.labelId}
            aria-describedby={!emailValid && email.length > 0 ? emailIds.errorId : undefined}
            aria-invalid={!emailValid && email.length > 0}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={!emailValid && email.length > 0 ? "border-destructive focus-visible:ring-destructive/20" : ""}
          />
          {!emailValid && email.length > 0 && (
            <p 
              id={emailIds.errorId} 
              role="alert"
              className="text-xs text-destructive flex items-center gap-1"
            >
              <AlertCircle className="h-3 w-3" aria-hidden="true" />
              Please enter a valid email address
            </p>
          )}
        </div>

        {/* Password Field */}
        <div className="space-y-2">
          <label 
            htmlFor={passwordIds.fieldId} 
            id={passwordIds.labelId}
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Password
          </label>
          <div className="relative">
            <Input
              id={passwordIds.fieldId}
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your password"
              required
              autoComplete="current-password"
              aria-labelledby={passwordIds.labelId}
              aria-describedby={showPassword ? `${passwordIds.fieldId}-visibility` : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              aria-describedby={`${passwordIds.fieldId}-visibility`}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
            <span id={`${passwordIds.fieldId}-visibility`} className="sr-only">
              Password is currently {showPassword ? "visible" : "hidden"}
            </span>
          </div>
        </div>

        {/* Submit Button */}
        <Button 
          type="submit" 
          disabled={isLoading || !canSubmit} 
          className="w-full"
          aria-describedby={isLoading ? "submit-status" : undefined}
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              {isRedirecting ? "Redirecting..." : "Signing in..."}
              <span id="submit-status" className="sr-only">
                {isRedirecting ? "Please wait while we redirect you" : "Please wait while we sign you in"}
              </span>
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        {/* Footer Links */}
        <div className="pt-2 text-center">
          <Link 
            href="/auth/forgot-password" 
            className="text-sm text-muted-foreground hover:text-primary transition-colors underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </form>
    </div>
  );
}