"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const emailValid = useMemo(() => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email), [email]);

  useEffect(() => {
    if (state.ok) {
      toast.success("Welcome back");
      router.replace("/dashboard");
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <form action={formAction} className="grid gap-4">
      <div className="grid gap-2">
        <Input
          name="email"
          type="email"
          placeholder="name@domain.com"
          required
          autoComplete="email"
          aria-label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {!emailValid && email.length > 0 && (
          <div className="text-xs text-destructive">Enter a valid email address</div>
        )}
        <div className="relative">
          <Input
            name="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            required
            autoComplete="current-password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground"
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      <Button type="submit" disabled={pending} className="w-full">
        {pending ? "Signing in..." : "Sign in"}
      </Button>
      <div className="flex items-center justify-start text-sm text-muted-foreground">
        <Link href="/auth/forgot-password" className="hover:underline">Forgot password?</Link>
      </div>
    </form>
  );
}


