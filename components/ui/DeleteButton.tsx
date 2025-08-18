"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Props = {
  title: string;
  description?: string;
  // Client-side handler mode
  onConfirm?: () => Promise<void> | void;
  // Server-action form submit mode
  formId?: string; // ID of a form rendered in a Server Component with action={...}
  label?: string;
  confirmLabel?: string;
  size?: React.ComponentProps<typeof Button>["size"];
  disabled?: boolean;
};

export function DeleteButton({
  title,
  description,
  onConfirm,
  formId,
  label = "Delete",
  confirmLabel = "Delete",
  size = "sm",
  disabled,
}: Props) {
  const [pending, setPending] = useState(false);

  const submitFormIfPresent = async () => {
    if (!formId) return false;
    const el = document.getElementById(formId) as HTMLFormElement | null;
    if (!el) return false;
    try {
      setPending(true);
      // Use requestSubmit to trigger native form submit to the server action
      el.requestSubmit();
    } finally {
      // pending will clear on navigation/revalidation; keep it during the transition
      setTimeout(() => setPending(false), 1500);
    }
    return true;
  };

  // Client callback mode
  return (
    <ConfirmDialog
      trigger={<Button variant="destructive" size={size} disabled={disabled || pending}>{pending ? `${label}…` : label}</Button>}
      title={title}
      description={description}
      confirmLabel={pending ? `${confirmLabel}…` : confirmLabel}
      onConfirm={async () => {
        // Prefer submitting a server-action form when provided
        if (await submitFormIfPresent()) return;
        if (onConfirm) {
          try {
            setPending(true);
            await onConfirm();
          } finally {
            setPending(false);
          }
        }
      }}
    />
  );
}


