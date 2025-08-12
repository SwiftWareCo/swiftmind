import { redirect } from "next/navigation";
import { createClient } from "@/server/supabase/server";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { completeInviteAction, completeInviteNewUserAction } from "@/server/auth/invite.actions";
import { buildTenantUrl } from "@/lib/utils/tenant";
import { PasswordFieldWithStrength } from "@/components/auth/PasswordFieldWithStrength";

export default async function InviteAcceptPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!token) return redirect("/auth/error?error=Missing invite token");
  const isNew = !user;

  // Prefill display name if exists (only when already signed in)
  let initialName = "";
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string | null }>();
    initialName = profile?.display_name ?? "";
  }

  async function Form({ tokenValue, initialName, isNew }: { tokenValue: string; initialName: string; isNew: boolean }) {
    "use server";
    // Action handler
    return (
      <form action={async (formData: FormData) => {
        "use server";
        const name = String(formData.get("display_name") ?? "").trim();
        const pwd = String(formData.get("password") ?? "").trim();
        const res = isNew
          ? await completeInviteNewUserAction(tokenValue, name, pwd)
          : await completeInviteAction(tokenValue, name, pwd);
        if (res.ok) {
          const slug = res.tenant_slug;
          if (slug) {
            const url = await buildTenantUrl(slug, "/dashboard");
            redirect(url);
          }
          redirect("/dashboard");
        }
        redirect(`/auth/error?error=${encodeURIComponent(res.error || "Invite failed")}`);
      }} className="grid gap-3 max-w-sm">
        <div className="grid gap-2">
          <label className="text-sm">Display name</label>
          <Input name="display_name" defaultValue={initialName} placeholder="Your name" required />
        </div>
        <PasswordFieldWithStrength name="password" />
        <Button type="submit">Accept invite</Button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh] px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept invitation</CardTitle>
          <CardDescription>Set your name and password to join this organization.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form tokenValue={token} initialName={initialName} isNew={isNew} />
        </CardContent>
      </Card>
    </div>
  );
}


