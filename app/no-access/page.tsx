import { createClient } from "@/server/supabase/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth/auth.actions";
import { DisplayNameModal } from "@/components/auth/DisplayNameModal";
import { headers } from "next/headers";

export default async function NoAccessPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { count } = await supabase
    .from("memberships")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) > 0) {
    // If the user has memberships, send them to their first tenant's dashboard (subdomain when configured)
    const { data: first } = await supabase
      .from("memberships")
      .select("tenant_id, tenants:tenant_id(slug)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle<{ tenant_id: string; tenants: { slug: string } | { slug: string }[] | null }>();
    let slug: string | null = null;
    if (first?.tenants) {
      if (Array.isArray(first.tenants)) slug = first.tenants[0]?.slug ?? null;
      else slug = first.tenants.slug;
    }
    const baseDomain = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN;
    if (slug && baseDomain) {
      // Try to preserve dev port
      const hdrHost = (await headers()).get("host") || "";
      const port = hdrHost.includes(":") ? hdrHost.split(":")[1] : "";
      const portPart = port ? `:${port}` : "";
      const proto = ((await headers()).get("x-forwarded-proto") || "http").split(",")[0];
      redirect(`${proto}://${slug}.${baseDomain}${portPart}/dashboard`);
    }
    redirect("/dashboard");
  }

  // Determine if we should prompt for display name here as well
  let shouldPrompt = false;
  let initialDisplayName: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("users")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle<{ display_name: string | null }>();
    initialDisplayName = profile?.display_name ?? null;
    shouldPrompt = !initialDisplayName;
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
      <DisplayNameModal shouldPrompt={shouldPrompt} initialDisplayName={initialDisplayName} />
      {/* Optional invite code placeholder */}
      {process.env.NEXT_PUBLIC_ENABLE_INVITE_CODE === "true" && (
        <div className="mt-8">
          <div className="text-sm text-muted-foreground mb-2">Have an invite code?</div>
          <form action={async () => { "use server"; }} className="flex items-center justify-center gap-2">
            <input name="invite_code" placeholder="Enter invite code" className="h-9 w-56 rounded-md border bg-background px-3 text-sm" />
            <Button type="submit" disabled>Submit</Button>
          </form>
        </div>
      )}
    </div>
  );
}


