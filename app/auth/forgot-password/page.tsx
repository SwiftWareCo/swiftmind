import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export default function Page() {
  return (
    <AuthShell 
      title="Reset your password" 
      subtitle="Don't worry, we'll help you get back in"
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}


