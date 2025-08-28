/**
 * Authentication error normalization utility
 * Provides consistent, user-friendly error messages and enumeration-safe messaging
 */

export interface AuthError {
  message: string;
  isEnumerationSafe?: boolean; // Whether the error reveals if an email exists
  suggestedAction?: string;
}

/**
 * Normalizes auth errors from Supabase into user-friendly messages
 * Implements enumeration-safe messaging to prevent email existence disclosure
 */
export function normalizeAuthError(error: string | undefined | null): AuthError {
  if (!error) {
    return {
      message: "An unexpected error occurred. Please try again.",
      suggestedAction: "Contact support if this problem persists."
    };
  }

  const errorLower = error.toLowerCase();

  // Password-related errors
  if (errorLower.includes("invalid login credentials") || 
      errorLower.includes("email not confirmed") ||
      errorLower.includes("invalid email or password")) {
    return {
      message: "Invalid email or password. Please check your credentials and try again.",
      isEnumerationSafe: true,
      suggestedAction: "Use the forgot password link if you need to reset your password."
    };
  }

  // Email validation errors
  if (errorLower.includes("invalid email") || errorLower.includes("email")) {
    return {
      message: "Please enter a valid email address.",
      suggestedAction: "Check for typos in your email address."
    };
  }

  // Password strength errors
  if (errorLower.includes("password") && errorLower.includes("short")) {
    return {
      message: "Password must be at least 8 characters long.",
      suggestedAction: "Use a combination of letters, numbers, and symbols for better security."
    };
  }

  if (errorLower.includes("password") && (errorLower.includes("weak") || errorLower.includes("strength"))) {
    return {
      message: "Please choose a stronger password.",
      suggestedAction: "Use a combination of letters, numbers, and symbols."
    };
  }

  // Rate limiting
  if (errorLower.includes("rate limit") || errorLower.includes("too many")) {
    return {
      message: "Too many attempts. Please wait a moment before trying again.",
      suggestedAction: "Wait a few minutes before making another request."
    };
  }

  // Token/link expiration
  if (errorLower.includes("expired") || errorLower.includes("invalid token")) {
    return {
      message: "This link has expired or is no longer valid.",
      suggestedAction: "Request a new link to continue."
    };
  }

  // Email confirmation
  if (errorLower.includes("email not confirmed") || errorLower.includes("confirm")) {
    return {
      message: "Please check your email and click the confirmation link.",
      suggestedAction: "Check your spam folder if you don't see the email."
    };
  }

  // Network/connectivity errors
  if (errorLower.includes("network") || errorLower.includes("connection") || errorLower.includes("timeout")) {
    return {
      message: "Connection error. Please check your internet connection and try again.",
      suggestedAction: "Ensure you have a stable internet connection."
    };
  }

  // Invite-specific errors
  if (errorLower.includes("invite") && errorLower.includes("revoked")) {
    return {
      message: "This invitation has been revoked.",
      suggestedAction: "Contact your organization admin for a new invitation."
    };
  }

  if (errorLower.includes("invite") && errorLower.includes("expired")) {
    return {
      message: "This invitation has expired.",
      suggestedAction: "Contact your organization admin for a new invitation."
    };
  }

  if (errorLower.includes("invite") && errorLower.includes("accepted")) {
    return {
      message: "This invitation has already been used.",
      suggestedAction: "Try signing in with your existing account."
    };
  }

  if (errorLower.includes("email mismatch") || errorLower.includes("email does not match")) {
    return {
      message: "This invitation is for a different email address.",
      suggestedAction: "Sign out and sign in with the invited email address."
    };
  }

  // Generic server errors
  if (errorLower.includes("500") || errorLower.includes("internal")) {
    return {
      message: "Our servers are experiencing issues. Please try again in a moment.",
      suggestedAction: "Contact support if this problem persists."
    };
  }

  // 404/Not found
  if (errorLower.includes("404") || errorLower.includes("not found")) {
    return {
      message: "The requested resource could not be found.",
      suggestedAction: "Check the link and try again."
    };
  }

  // 401/Unauthorized
  if (errorLower.includes("401") || errorLower.includes("unauthorized")) {
    return {
      message: "You are not authorized to perform this action.",
      suggestedAction: "Please sign in and try again."
    };
  }

  // Fallback for unknown errors - don't expose raw error messages
  return {
    message: "Something went wrong. Please try again.",
    suggestedAction: "Contact support if this problem continues."
  };
}

/**
 * Gets enumeration-safe success message for password reset requests
 * Always shows the same message regardless of whether email exists
 */
export function getPasswordResetSuccessMessage(email: string): string {
  return `If an account with ${email} exists, we've sent you a password reset link. Please check your email and spam folder.`;
}

/**
 * Gets enumeration-safe success message for login/signup attempts
 */
export function getEmailVerificationMessage(email: string): string {
  return `We've sent a verification link to ${email}. Please check your email and spam folder, then click the link to continue.`;
}

/**
 * Validates if an error should trigger a resend action
 */
export function canResendEmail(error: string | undefined | null): boolean {
  if (!error) return false;
  
  const errorLower = error.toLowerCase();
  return errorLower.includes("expired") || 
         errorLower.includes("invalid token") ||
         errorLower.includes("link") && errorLower.includes("invalid");
}

/**
 * Gets appropriate timeout for rate limiting based on error
 */
export function getRateLimitTimeout(error: string | undefined | null): number {
  if (!error) return 0;
  
  const errorLower = error.toLowerCase();
  
  // Extract timeout from error message if present
  const timeoutMatch = errorLower.match(/(\d+)\s*(second|minute|hour)/);
  if (timeoutMatch) {
    const value = parseInt(timeoutMatch[1]);
    const unit = timeoutMatch[2];
    
    switch (unit) {
      case 'second': return value;
      case 'minute': return value * 60;
      case 'hour': return value * 3600;
      default: return 60; // Default 1 minute
    }
  }
  
  // Default timeouts based on error type
  if (errorLower.includes('rate limit') || errorLower.includes('too many')) {
    return 60; // 1 minute default
  }
  
  return 0;
}
