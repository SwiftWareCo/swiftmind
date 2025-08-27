"use client";

import React, { useState } from "react";
import { useActionState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { updateDocumentRoles } from "@/server/kb/kb.actions";
import { toast } from "sonner";
import { Edit } from "lucide-react";

interface Props {
  docId: string;
  docTitle: string;
  currentRoles: string[];
  onSuccess?: () => void;
}

const AVAILABLE_ROLES = [
  { id: 'admin', label: 'Admin' },
  { id: 'operations', label: 'Operations' },
  { id: 'support', label: 'Support' },
];

export function EditRolesDialog({ docId, docTitle, currentRoles, onSuccess }: Props) {
  const [open, setOpen] = useState(false);
  const [selectedRoles, setSelectedRoles] = useState<string[]>(currentRoles);
  const [updateState, updateAction, isPending] = useActionState(updateDocumentRoles, { ok: false });
  const [hasShownToast, setHasShownToast] = useState(false);

  const handleRoleChange = (roleId: string, checked: boolean) => {
    if (checked) {
      setSelectedRoles(prev => [...prev, roleId]);
    } else {
      setSelectedRoles(prev => prev.filter(r => r !== roleId));
    }
  };

  const handleSubmit = async (formData: FormData) => {
    // Add selected roles to form data
    selectedRoles.forEach(role => {
      formData.append('allowed_roles', role);
    });
    
    await updateAction(formData);
  };

  // Handle the result in useEffect
  React.useEffect(() => {
    // Only show toast if we haven't already shown one for this update
    if (!hasShownToast && updateState.ok) {
      toast.success("Document roles updated successfully");
      setOpen(false);
      setHasShownToast(true);
      onSuccess?.();
    } else if (!hasShownToast && updateState.error) {
      toast.error(updateState.error || "Failed to update roles");
      setHasShownToast(true);
    }
  }, [updateState, onSuccess, hasShownToast]);

  // Reset toast flag when dialog opens
  React.useEffect(() => {
    if (open) {
      setHasShownToast(false);
      setSelectedRoles(currentRoles);
    }
  }, [open, currentRoles]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="h-8 w-8 p-0"
          title="Edit roles"
        >
          <Edit className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Document Access</DialogTitle>
          <DialogDescription>
            Configure which roles can access &quot;{docTitle}&quot;
          </DialogDescription>
        </DialogHeader>
        
        <form action={handleSubmit} className="space-y-4">
          <input type="hidden" name="doc_id" value={docId} />
          
          <div className="space-y-3">
            <p className="text-sm font-medium">Select roles that can access this document:</p>
            
            {AVAILABLE_ROLES.map((role) => (
              <div key={role.id} className="flex items-center space-x-2">
                <Checkbox
                  id={role.id}
                  checked={selectedRoles.includes(role.id)}
                  onCheckedChange={(checked) => handleRoleChange(role.id, !!checked)}
                />
                <label 
                  htmlFor={role.id}
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  {role.label}
                </label>
              </div>
            ))}
          </div>
          
          {selectedRoles.length === 0 && (
            <p className="text-sm text-destructive">
              At least one role must be selected
            </p>
          )}
          
          <DialogFooter>
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={isPending || selectedRoles.length === 0}
            >
              {isPending ? "Updating..." : "Update Roles"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
