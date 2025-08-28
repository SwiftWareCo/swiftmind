"use client";

import { useState, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { completeInviteAction, completeInviteNewUserAction } from "@/server/auth/invite.actions";
import { normalizeAuthError } from "@/lib/utils/auth-errors";
import { AlertCircle, Loader2, Eye, EyeOff, Users, Shield } from "lucide-react";

interface Props {
  token: string;
  tenantName: string;
  tenantSlug: string;
  roleName: string;
  isNewUser: boolean;
  initialDisplayName?: string;
}

type ActionState = { ok: boolean; error?: string; tenant_slug?: string };

const initialState: ActionState = { ok: false };

interface PasswordStrength {
  score: number;
  feedback: string[];
  label: string;
}

function calculatePasswordStrength(password: string): PasswordStrength {
  if (!password) {
    return { score: 0, feedback: [], label: "Enter a password" };
  }

  let score = 0;
  const feedback: string[] = [];

  if (password.length >= 8) score += 25;
  else feedback.push("At least 8 characters");

  if (/[a-z]/.test(password)) score += 20;
  else feedback.push("Include lowercase letters");

  if (/[A-Z]/.test(password)) score += 20;
  else feedback.push("Include uppercase letters");

  if (/[0-9]/.test(password)) score += 20;
  else feedback.push("Include numbers");

  if (/[^a-zA-Z0-9]/.test(password)) score += 15;
  else feedback.push("Include special characters");

  let label: string;
  if (score >= 80) label = "Strong";
  else if (score >= 60) label = "Good";
  else if (score >= 40) label = "Fair";
  else if (score >= 20) label = "Weak";
  else label = "Too weak";

  return { score, feedback, label };
}

export function InviteAcceptForm({ 
  token, 
  isNewUser, 
  initialDisplayName = "" 
}: Pick<Props, 'token' | 'isNewUser' | 'initialDisplayName'>) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Choose the appropriate action based on user status
  const action = isNewUser ? completeInviteNewUserAction : completeInviteAction;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prevState: ActionState | undefined, formData: FormData) => {
      const name = String(formData.get("display_name") ?? "").trim();
      const pwd = String(formData.get("password") ?? "").trim();
      
      try {
        const result = await action(token, name, pwd);
        // If result is void (redirect happened), this won't execute
        // If result is ActionResult, convert to ActionState
        return result ? { ok: result.ok, error: result.error } : { ok: true };
      } catch {
        // This will never be reached since redirect() throws a special redirect error
        // that Next.js handles internally, but we need this for type safety
        return { ok: false, error: "An unexpected error occurred" };
      }
    },
    initialState
  );

  // Password strength calculation
  const strength = calculatePasswordStrength(password);
  const canSubmit = displayName.trim().length > 0 && password.length >= 8 && strength.score >= 40;

  // Normalize error for display
  const authError = state.error ? normalizeAuthError(state.error) : null;
  return (
    <div className="space-y-4">
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

      {/* Welcome Message */}
      <div className="space-y-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/20 rounded-full flex items-center justify-center">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
        </div>
        <div className="space-y-2">
          <h3 className="text-lg font-semibold">
            {isNewUser ? "Create your account" : "Complete your invitation"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {isNewUser 
              ? "Set up your profile to join the workspace" 
              : "Update your information to accept the invitation"
            }
          </p>
        </div>
      </div>

      <form action={formAction} className="space-y-3">
        {/* Display Name Field */}
        <div className="space-y-2">
          <label htmlFor="display_name" className="text-sm font-medium leading-none">
            Display name
          </label>
          <Input
            id="display_name"
            name="display_name"
            type="text"
            placeholder="Your name"
            required
            autoComplete="name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            This is how your name will appear to other members.
          </p>
        </div>

        {/* Password Field */}
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium leading-none">
            Password
          </label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              placeholder="Create a secure password"
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
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Password strength</span>
                <span className={`font-medium ${strength.score >= 60 ? 'text-green-600' : strength.score >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {strength.label}
                </span>
              </div>
              <Progress value={strength.score} className="h-2" />
              {strength.feedback.length > 0 && (
                <div className="space-y-1">
                  {strength.feedback.slice(0, 2).map((tip, index) => (
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

        {/* Submit Button */}
        <Button 
          type="submit" 
          disabled={pending || !canSubmit} 
          className="w-full"
        >
          {pending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {isNewUser ? "Creating account..." : "Accepting invitation..."}
            </>
          ) : (
            <>
              <Shield className="mr-2 h-4 w-4" />
              {isNewUser ? "Create account" : "Accept invitation"}
            </>
          )}
        </Button>

        {/* Help text */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            By continuing, you agree to our terms of service and privacy policy.
          </p>
        </div>
      </form>
    </div>
  );
}
