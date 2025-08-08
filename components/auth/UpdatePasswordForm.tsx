"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updatePassword } from "@/server/auth/auth.actions";
import { toast } from "sonner";

type ActionState = { ok: boolean; error?: string };

const initialState: ActionState = { ok: false };

export function UpdatePasswordForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updatePassword, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Password updated");
      router.replace("/auth/login");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-4">
      <Input name="password" type="password" placeholder="New password" required autoComplete="new-password" aria-label="New password" />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Updating..." : "Update password"}
      </Button>
    </form>
  );
}


