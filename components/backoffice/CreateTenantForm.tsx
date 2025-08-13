"use client";

import { useEffect, useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast, Toaster } from "sonner";
import { useFormStatus } from "react-dom";

type CreateState = { ok?: boolean; error?: string; createdAdminEmail?: string; temporaryPassword?: string };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create"}</Button>
  );
}

export function CreateTenantForm({ action }: { action: (prev: CreateState | undefined, formData: FormData) => Promise<CreateState> }) {
  const [state, formAction] = useActionState(action, undefined);

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      if (state.createdAdminEmail) {
        toast.success("Tenant created. Initial admin provisioned.");
        if (state.temporaryPassword) {
          toast.message("Temporary password generated", {
            description: `Email: ${state.createdAdminEmail}\nTemp password: ${state.temporaryPassword}`,
          });
        }
      } else {
        toast.success("Tenant created.");
      }
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state]);

  return (
    <form action={formAction} className="grid gap-3 max-w-md">
      <Input name="name" placeholder="Tenant name" required />
      <Input name="slug" placeholder="Slug (e.g. acme)" required />
      <Input name="email" placeholder="Initial admin email (optional) — will be created if not found" />
      <div>
        <SubmitButton />
      </div>
      <Toaster />
    </form>
  );
}


