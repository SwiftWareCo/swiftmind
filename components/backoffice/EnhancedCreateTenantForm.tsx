"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast, Toaster } from "sonner";
import { Copy, Mail, Key, UserPlus, CheckCircle, Loader2 } from "lucide-react";
import { createTenantAction } from "@/server/tenants/tenants.actions";

type CreateState = { 
  ok?: boolean; 
  error?: string; 
  tenant?: { name: string; slug: string };
  adminSetup?: {
    method: "temporary_password" | "invitation_link" | "existing_user";
    email: string;
    temporaryPassword?: string;
    inviteLink?: string;
  };
};

// Mutation function to create tenant
async function createTenant(data: {
  name: string;
  slug: string;
  email: string;
  adminMethod: "invitation_link" | "temporary_password";
}): Promise<CreateState> {
  const result = await createTenantAction(
    data.name,
    data.slug, 
    data.email || undefined,
    data.adminMethod
  );
  
  if (!result.ok) {
    throw new Error(result.error || "Failed to create tenant");
  }
  
  // Transform the result to match CreateState format
  return {
    ok: true,
    tenant: { name: result.tenant!.name, slug: result.tenant!.slug },
    adminSetup: result.createdAdmin ? {
      method: result.createdAdmin.method || data.adminMethod,
      email: result.createdAdmin.email,
      temporaryPassword: result.createdAdmin.temporaryPassword,
      inviteLink: result.createdAdmin.inviteLink,
    } : undefined
  };
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy to clipboard");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      disabled={copied}
    >
      {copied ? (
        <CheckCircle className="h-4 w-4 text-green-600" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {copied ? "Copied!" : `Copy ${label}`}
    </Button>
  );
}

export function EnhancedCreateTenantForm() {
  const queryClient = useQueryClient();
  const [adminMethod, setAdminMethod] = useState<"invitation_link" | "temporary_password">("invitation_link");
  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    email: "",
  });

  const mutation = useMutation({
    mutationFn: createTenant,
    onSuccess: (data) => {
      toast.success("Tenant created successfully!");
      
      if (data.adminSetup) {
        const { method, email } = data.adminSetup;
        
        switch (method) {
          case "existing_user":
            toast.success(`Existing user ${email} has been granted admin access`);
            break;
          case "temporary_password":
            toast.success("Temporary admin credentials generated");
            break;
          case "invitation_link":
            toast.success("Admin invitation link generated");
            break;
        }
      }
      
      // Reset form
      setFormData({ name: "", slug: "", email: "" });
      setAdminMethod("invitation_link");
      
      // Invalidate queries to refresh tenant list
      queryClient.invalidateQueries({ queryKey: ["tenants"] });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.slug || !formData.email) {
      toast.error("Please fill in all required fields");
      return;
    }
    
    mutation.mutate({
      name: formData.name,
      slug: formData.slug,
      email: formData.email,
      adminMethod,
    });
  };

  return (
    <div className="space-y-6">
      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium">
              Tenant Name
            </label>
            <Input 
              id="name"
              name="name" 
              placeholder="Acme Corporation" 
              required 
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              disabled={mutation.isPending}
            />
          </div>
          
          <div className="space-y-2">
            <label htmlFor="slug" className="text-sm font-medium">
              Tenant Slug
            </label>
            <Input 
              id="slug"
              name="slug" 
              placeholder="acme" 
              required 
              pattern="[a-z0-9-]+"
              title="Only lowercase letters, numbers, and hyphens"
              value={formData.slug}
              onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
              disabled={mutation.isPending}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium">
            Initial Admin Email
          </label>
          <Input 
            id="email"
            name="email" 
            type="email"
            placeholder="admin@acme.com" 
            required
            value={formData.email}
            onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
            disabled={mutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            The email address for the initial tenant administrator
          </p>
        </div>

        <div className="space-y-2">
          <label htmlFor="admin_method" className="text-sm font-medium">
            Admin Setup Method
          </label>
          <Select value={adminMethod} onValueChange={(value: "invitation_link" | "temporary_password") => setAdminMethod(value)} disabled={mutation.isPending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="invitation_link">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Send Invitation Link (Recommended)
                </div>
              </SelectItem>
              <SelectItem value="temporary_password">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4" />
                  Generate Temporary Password
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {adminMethod === "invitation_link" 
              ? "Admin will receive a secure invitation link to set up their account"
              : "Admin will receive temporary credentials that must be changed on first login"
            }
          </p>
        </div>

        <Button type="submit" disabled={mutation.isPending} className="w-full">
          {mutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creating tenant...
            </>
          ) : (
            <>
              <UserPlus className="mr-2 h-4 w-4" />
              Create Tenant
            </>
          )}
        </Button>
      </form>

      {/* Success State - Show Credentials */}
      {mutation.isSuccess && mutation.data?.adminSetup && (
        <Card className="border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-800 dark:text-green-200">
              <CheckCircle className="h-5 w-5" />
              Tenant Created Successfully
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Tenant:</span>
                <Badge variant="secondary">{mutation.data.tenant?.name} ({mutation.data.tenant?.slug})</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Admin Email:</span>
                <code className="text-sm bg-muted px-2 py-1 rounded">{mutation.data.adminSetup.email}</code>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Setup Method:</span>
                <Badge variant={
                  mutation.data.adminSetup.method === "invitation_link" ? "default" :
                  mutation.data.adminSetup.method === "temporary_password" ? "secondary" :
                  "outline"
                }>
                  {mutation.data.adminSetup.method === "invitation_link" ? "Invitation Link" :
                   mutation.data.adminSetup.method === "temporary_password" ? "Temporary Password" :
                   "Existing User"}
                </Badge>
              </div>
            </div>

            {/* Temporary Password */}
            {mutation.data.adminSetup.method === "temporary_password" && mutation.data.adminSetup.temporaryPassword && (
              <Alert>
                <Key className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Temporary Password Generated:</p>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                        {mutation.data.adminSetup.temporaryPassword}
                      </code>
                      <CopyButton text={mutation.data.adminSetup.temporaryPassword} label="Password" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ⚠️ Save this password securely. The admin must change it on first login.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Invitation Link */}
            {mutation.data.adminSetup.method === "invitation_link" && mutation.data.adminSetup.inviteLink && (
              <Alert>
                <Mail className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Admin Invitation Link:</p>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-2 py-1 rounded text-sm break-all">
                        {mutation.data.adminSetup.inviteLink}
                      </code>
                      <CopyButton text={mutation.data.adminSetup.inviteLink} label="Link" />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      ✅ Send this link to the admin. It expires in 14 days.
                    </p>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Existing User */}
            {mutation.data.adminSetup.method === "existing_user" && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  <p>The user already exists and has been granted admin access to this tenant.</p>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      <Toaster />
    </div>
  );
}
