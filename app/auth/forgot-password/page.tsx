import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function Page() {
  return (
    <AuthShell title="Reset your password" subtitle="Enter your email and we’ll send you a reset link">
      <ForgotPasswordForm />
    </AuthShell>
  );
}


