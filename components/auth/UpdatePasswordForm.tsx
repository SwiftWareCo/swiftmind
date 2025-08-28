"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { updatePassword } from "@/server/auth/auth.actions";
import { normalizeAuthError } from "@/lib/utils/auth-errors";
import { AlertCircle, Loader2, CheckCircle, Eye, EyeOff, Shield } from "lucide-react";

type ActionState = { ok: boolean; error?: string };

const initialState: ActionState = { ok: false };

interface PasswordStrength {
  score: number;
  feedback: string[];
  label: string;
  color: string;
}

function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, feedback: [], label: "Enter a password", color: "bg-gray-200" };
  }

  let score = 0;
  const feedback: string[] = [];

  // Length check
  if (password.length >= 8) {
    score += 20;
  } else {
    feedback.push("At least 8 characters");
  }

  if (password.length >= 12) {
    score += 10;
  }

  // Character variety checks
  if (/[a-z]/.test(password)) {
    score += 15;
  } else {
    feedback.push("Include lowercase letters");
  }

  if (/[A-Z]/.test(password)) {
    score += 15;
  } else {
    feedback.push("Include uppercase letters");
  }

  if (/[0-9]/.test(password)) {
    score += 15;
  } else {
    feedback.push("Include numbers");
  }

  if (/[^a-zA-Z0-9]/.test(password)) {
    score += 15;
  } else {
    feedback.push("Include special characters");
  }

  // Bonus for length
  if (password.length >= 16) {
    score += 10;
  }

  // Determine label and color
  let label: string;
  let color: string;

  if (score >= 80) {
    label = "Excellent";
    color = "bg-green-500";
  } else if (score >= 60) {
    label = "Good";
    color = "bg-blue-500";
  } else if (score >= 40) {
    label = "Fair";
    color = "bg-yellow-500";
  } else if (score >= 20) {
    label = "Weak";
    color = "bg-orange-500";
  } else {
    label = "Too weak";
    color = "bg-red-500";
  }

  return { score, feedback, label, color };
}

export function UpdatePasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePassword, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Password strength calculation
  const strength = calculatePasswordStrength(password);
  const passwordsMatch = !confirmPassword || password === confirmPassword;
  const canSubmit = password.length >= 8 && passwordsMatch && strength.score >= 40;

  // Handle success
  useEffect(() => {
    if (state.ok) {
      setShowSuccess(true);
      // Redirect after showing success message
      const timer = setTimeout(() => {
        router.replace("/auth/login");
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [state.ok, router]);

  // Normalize error for display
  const authError = state.error ? normalizeAuthError(state.error) : null;

  // Success state
  if (showSuccess) {
    return (
      <div className="space-y-6">
        <div className="text-center space-y-4">
          <div className="mx-auto w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center">
            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">Password updated</h3>
            <p className="text-sm text-muted-foreground">
              Your password has been successfully updated. You can now sign in with your new password.
            </p>
          </div>
        </div>

        <div className="text-center">
          <Button onClick={() => router.replace("/auth/login")} className="w-full">
            Continue to login
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
        <div className="mx-auto w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
          <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold">Create new password</h3>
        <p className="text-sm text-muted-foreground">
          Choose a strong password to secure your account.
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {/* Password Field */}
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-medium leading-none">
            New password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Enter your new password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          {/* Password Strength Indicator */}
          {password && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Password strength</span>
                <span className={`font-medium ${strength.score >= 60 ? 'text-green-600' : strength.score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {strength.label}
                </span>
              </div>
              <Progress value={strength.score} className="h-2" />
              {strength.feedback.length > 0 && (
                <div className="space-y-1">
                  {strength.feedback.map((tip, index) => (
                    <p key={index} className="text-xs text-muted-foreground flex items-center gap-1">
                      <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                      {tip}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Confirm Password Field */}
        <div className="space-y-2">
          <label htmlFor="confirm-password" className="text-sm font-medium leading-none">
            Confirm new password
          </label>
          <div className="relative">
            <Input
              id="confirm-password"
              name="confirm_password"
              type={showConfirm ? "text" : "password"}
              placeholder="Confirm your new password"
              required
              autoComplete="new-password"
              aria-describedby={!passwordsMatch ? "confirm-error" : undefined}
              aria-invalid={!passwordsMatch}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={`pr-10 ${!passwordsMatch ? "border-destructive focus-visible:ring-destructive/20" : ""}`}
            />
            <button
              type="button"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {!passwordsMatch && confirmPassword.length > 0 && (
            <p id="confirm-error" className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Passwords don't match
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
              Updating password...
            </>
          ) : (
            "Update password"
          )}
        </Button>

        {/* Help text */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            After updating, you'll be redirected to sign in with your new password.
          </p>
        </div>
      </form>
    </div>
  );
}