"use client";

import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sendPasswordReset } from "@/server/auth/auth.actions";
import { toast } from "sonner";

type ActionState = { ok: boolean; error?: string };

const initialState: ActionState = { ok: false };

export function ForgotPasswordForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(sendPasswordReset, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Password reset email sent");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} className="grid gap-4">
      <Input name="email" type="email" placeholder="name@domain.com" required autoComplete="email" aria-label="Email" />
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Sending..." : "Send reset email"}
      </Button>
    </form>
  );
}


