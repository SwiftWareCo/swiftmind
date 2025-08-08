"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { signInWithPassword } from "@/server/auth/auth.actions";

type ActionState = { ok: boolean; error?: string };

const initialState: ActionState = { ok: false };

export function LoginForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(signInWithPassword, initialState);

  useEffect(() => {
    if (state.ok) {
      toast.success("Welcome back");
      router.replace("/");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Input name="email" type="email" placeholder="name@domain.com" required autoComplete="email" aria-label="Email" />
        <Input name="password" type="password" placeholder="••••••••" required autoComplete="current-password" aria-label="Password" />
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <Link href="/auth/forgot-password" className="hover:underline">Forgot password?</Link>
        <Link href="/auth/sign-up" className="hover:underline">Create account</Link>
      </div>
    </form>
  );
}


