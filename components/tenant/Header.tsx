import { getCurrentUserMemberships } from "@/server/memberships/memberships.data";
import { TenantSwitcher } from "@/components/tenant/TenantSwitcher";
import { createClient } from "@/server/supabase/server";
import { DisplayNameModal } from "@/components/auth/DisplayNameModal";
import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth/auth.actions";
import { getTenantSlug } from "@/lib/utils/tenant";
import { getTenantBySlug } from "@/server/tenants/tenants.data";
import { hasPermission } from "@/server/permissions/permissions.data";
import { MobileSidebarButton } from "@/components/tenant/MobileSidebarButton";

export async function Header() {
  const memberships = await getCurrentUserMemberships();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let displayName: string | null = null;
  let emailLocal: string = "";
  let shouldPrompt = false;
  let isAdmin = false;
  if (user) {
    const email = user.email || "";
    emailLocal = email.includes("@") ? email.split("@")[0] : email;
    // Fetch profile (public.users) to get display_name and avatar_url if present via RLS view/table
    const { data } = await supabase.from("users").select("id, display_name, avatar_url").eq("id", user.id).maybeSingle<{
      id: string; display_name: string | null; avatar_url: string | null;
    }>();
    displayName = data?.display_name ?? null;
    shouldPrompt = !displayName;
  }
  try {
    const slug = await getTenantSlug();
    if (slug) {
      const tenant = await getTenantBySlug(slug);
      isAdmin = await hasPermission(tenant.id, "members.manage");
    }
  } catch {}
  return (
    <div className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center justify-between px-4 sm:px-6 md:px-8">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <MobileSidebarButton isAdmin={isAdmin} />
          <TenantSwitcher memberships={memberships.map((m) => ({ id: m.tenant.id, slug: m.tenant.slug, name: m.tenant.name }))} />
        </div>
        <div className="flex items-center gap-2 sm:gap-3 text-sm text-muted-foreground">
          {user && (
            <>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-full bg-muted" />
                <span className="hidden sm:inline max-w-[200px] truncate">
                  {displayName || emailLocal}
                </span>
              </div>
              <form action={async () => { "use server"; await signOut(); }}>
                <Button variant="outline" size="sm" type="submit" aria-label="Sign out">Sign out</Button>
              </form>
            </>
          )}
        </div>
      </div>
      {/* Prompt for display name if missing */}
      <DisplayNameModal shouldPrompt={shouldPrompt} initialDisplayName={null} />
    </div>
  );
}


