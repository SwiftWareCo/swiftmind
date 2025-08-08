import { AuthShell } from "@/components/auth/AuthShell";
import { UpdatePasswordForm } from "@/components/auth/UpdatePasswordForm";

export default function Page() {
  return (
    <AuthShell title="Set a new password" subtitle="Choose a strong password to secure your account">
      <UpdatePasswordForm />
    </AuthShell>
  );
}


