"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { signUpWithPassword } from "@/server/auth/auth.actions";

type ActionState = { ok: boolean; error?: string };

const initialState: ActionState = { ok: false };

export function SignUpForm() {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signUpWithPassword, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Check your email to confirm your account");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Input name="email" type="email" placeholder="name@domain.com" required autoComplete="email" aria-label="Email" />
        <Input name="password" type="password" placeholder="Create a password" required autoComplete="new-password" aria-label="Password" />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Creating account..." : "Create account"}
      </Button>
      <div className="text-sm text-muted-foreground text-center">
        <Link href="/auth/login" className="hover:underline">Already have an account? Sign in</Link>
      </div>
    </form>
  );
}


