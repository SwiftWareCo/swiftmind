import { AuthShell } from "@/components/auth/AuthShell";
import { SignUpForm } from "@/components/auth/SignUpForm";

export default function Page() {
  return (
    <AuthShell title="Create your account" subtitle="Start your journey with Swiftmind">
      <SignUpForm />
    </AuthShell>
  );
}