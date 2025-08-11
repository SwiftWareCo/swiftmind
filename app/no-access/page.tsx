import { createClient } from "@/server/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth/auth.actions";

export default async function NoAccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { count } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) > 0) {
    redirect("/dashboard");
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">No access yet</h1>
      <p className="mt-2 text-muted-foreground">Access is by invitation only. You need an invitation from your organization admin.</p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <form action={async () => { "use server"; await signOut(); }}>
          <Button variant="outline" type="submit">Sign out</Button>
        </form>
        <Button asChild>
          <Link href="mailto:support@swiftmind.app">Contact support</Link>
        </Button>
      </div>
      {/* Optional invite code placeholder */}
      {process.env.NEXT_PUBLIC_ENABLE_INVITE_CODE === "true" && (
        <div className="mt-8">
          <div className="text-sm text-muted-foreground mb-2">Have an invite code?</div>
          <form action={async () => { "use server"; }} className="flex items-center justify-center gap-2">
            <input name="invite_code" placeholder="Enter invite code" className="h-9 w-56 rounded-md border bg-background px-3 text-sm" />
            <Button type="submit" disabled>Submit</Button>
          </form>
          <div className="mt-2 text-xs text-muted-foreground">Invites coming soon</div>
        </div>
      )}
    </div>
  );
}


