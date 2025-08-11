"use client";

import { useActionState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { deleteKbDoc, type DeleteState } from "@/server/kb/kb.actions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { kbDocsKeys } from "@/lib/queryOptions/kbQueryOptions";

type Props = { docId: string; tenantId: string };

export function DeleteDocButton({ docId, tenantId }: Props) {
  const [state, formAction, pending] = useActionState<DeleteState, FormData>(deleteKbDoc, { ok: false });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!state) return;
    if (state.ok) {
      toast.success("Document deleted");
      queryClient.invalidateQueries({ queryKey: kbDocsKeys.list(tenantId) });
    } else if (state.error) {
      toast.error(state.error);
    }
  }, [state, queryClient, tenantId]);

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">Delete</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete document?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the document and its chunks. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="outline">Cancel</Button>
          </AlertDialogCancel>
          <form
            action={(fd) => {
              fd.append("doc_id", docId);
              formAction(fd);
            }}
          >
            <AlertDialogAction asChild>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Deleting..." : "Confirm"}
              </Button>
            </AlertDialogAction>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}


