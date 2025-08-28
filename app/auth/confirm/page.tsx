import { createClient } from "@/server/supabase/server";
import { type EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { ConfirmPageClient } from "@/components/auth/ConfirmPageClient";

interface SearchParams {
  token_hash?: string;
  type?: EmailOtpType;
  next?: string;
  error?: string;
}

export default async function ConfirmPage({ 
  searchParams 
}: { 
  searchParams: Promise<SearchParams> 
}) {
  const params = await searchParams;
  const { token_hash, type, next = "/dashboard", error } = params;

  // If there's already an error in the URL, show it
  if (error) {
    return (
      <ConfirmPageClient
        type={(type as any) || "signup"}
        error={error}
        next={next}
      />
    );
  }

  // If we have token and type, try to verify
  if (token_hash && type) {
    const supabase = await createClient();

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        type,
        token_hash,
      });

      if (!verifyError) {
        // Success - redirect to the intended destination
        redirect(next);
      } else {
        // Verification failed - show error state
        return (
          <ConfirmPageClient
            type={type === "recovery" ? "recovery" : "signup"}
            error={verifyError.message}
            next={next}
          />
        );
      }
    } catch (error) {
      // Unexpected error during verification
      return (
        <ConfirmPageClient
          type={type === "recovery" ? "recovery" : "signup"}
          error="An unexpected error occurred during verification"
          next={next}
        />
      );
    }
  }

  // No token or type - show generic error
  return (
    <ConfirmPageClient
      type="signup"
      error="No verification token provided. The link may be incomplete or invalid."
      next={next}
    />
  );
}
