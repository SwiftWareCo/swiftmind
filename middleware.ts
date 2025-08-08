import { NextRequest } from "next/server";
import { updateSession } from "@/server/supabase/middleware";


// Resolve tenant slug from subdomain. Optionally set NEXT_PUBLIC_APP_BASE_DOMAIN to your apex, e.g. "swiftmind.app".
function resolveTenantSlug(request: NextRequest): string | null {
  const hostHeader = request.headers.get("host");
  if (!hostHeader) return null;

  // Strip port if present
  const hostname = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  const baseDomain = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN?.toLowerCase();

  // Handle localhost-style subdomains (e.g., slug.localhost or slug.localhost:3000 via custom DNS/hosts)
  if (hostname.endsWith("localhost")) {
    const parts = hostname.split(".");
    // [slug, 'localhost']
    if (parts.length === 2) {
      const candidate = parts[0];
      if (candidate && candidate !== "www") return candidate;
    }
    return null;
  }

  // Handle custom base domain (e.g., slug.swiftmind.app)
  if (baseDomain && hostname.endsWith(baseDomain)) {
    const withoutBase = hostname.slice(0, -baseDomain.length);
    // Remove trailing dot if present
    const trimmed = withoutBase.endsWith(".") ? withoutBase.slice(0, -1) : withoutBase;
    if (!trimmed) return null; // apex domain
    const parts = trimmed.split(".");
    const candidate = parts[parts.length - 1] || parts[0];
    if (candidate && candidate !== "www") return candidate;
    return null;
  }

  // Generic subdomain (e.g., slug.example.com) when base domain not configured
  const parts = hostname.split(".");
  if (parts.length > 2) {
    const candidate = parts[0];
    if (candidate && candidate !== "www") return candidate;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const slug = resolveTenantSlug(request);
  const requestHeaders = new Headers(request.headers);
  if (slug) requestHeaders.set("x-tenant-slug", slug);

  // Delegate to Supabase session refresh (writes cookies safely), while preserving our header
  const response = await updateSession(request, requestHeaders);
  return response;
}

export const config = {
  // Skip static files and images
matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|ico)).*)",
  ],
};


