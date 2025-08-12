"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";

function calcStrength(pwd: string): { label: string; score: number } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const label = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"][score] || "Very weak";
  return { label, score };
}

export function PasswordFieldWithStrength({ name }: { name: string }) {
  const [pwd, setPwd] = useState("");
  const { label, score } = useMemo(() => calcStrength(pwd), [pwd]);
  const percent = Math.min(100, Math.max(0, (score / 5) * 100));

  return (
    <div className="grid gap-2">
      <label className="text-sm">Set a password</label>
      <Input
        name={name}
        type="password"
        placeholder="Create a password"
        required
        minLength={8}
        value={pwd}
        onChange={(e) => setPwd(e.target.value)}
      />
      <div className="h-1.5 w-full rounded bg-muted overflow-hidden">
        <div className="h-full bg-primary transition-all" style={{ width: `${percent}%` }} />
      </div>
      <div className="text-xs text-muted-foreground">{label} — use 8+ chars with letters, numbers, and symbols</div>
    </div>
  );
}


