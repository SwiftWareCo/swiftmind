import { headers } from "next/headers";

export type ResolvedTenant = {
  id: string;
  slug: string;
  name: string;
};

export async function getTenantSlug(): Promise<string | null> {
  const hdrs = await headers();
  const slug = hdrs.get("x-tenant-slug");
  return slug ?? null;
}


/**
 * 🔧 SERVER-SIDE Tenant URL Builder
 * 
 * Use this function in SERVER COMPONENTS and SERVER ACTIONS
 * - Pages, layouts, and server components
 * - Server actions and API routes
 * - Any code that runs on the server and needs headers()
 * 
 * @param slug - The tenant subdomain slug (e.g., "acme")
 * @param path - The path within the tenant (e.g., "/dashboard")
 * @returns Promise<string> - Full URL with tenant subdomain and port
 * 
 * @example
 * // In a server component:
 * import { buildTenantUrl } from "@/lib/utils/tenant";
 * const url = await buildTenantUrl("acme", "/dashboard");
 * redirect(url);
 * 
 * @example
 * // In a server action:
 * const { buildTenantUrl } = await import("@/lib/utils/tenant");
 * const tenantUrl = await buildTenantUrl(slug, "/dashboard");
 */
export async function buildTenantUrl(slug: string, path: string): Promise<string> {
  const hdrs = await headers();
  const forwardedHost = hdrs.get("x-forwarded-host");
  const host = forwardedHost ?? hdrs.get("host") ?? "localhost:3000";
  const baseDomain = process.env.NEXT_PUBLIC_APP_BASE_DOMAIN?.replace(/:\d+$/, "");

  const [hostname, portPart] = host.split(":");
  const port = portPart ? `:${portPart}` : "";

  // Helper to construct http URL with current dev port
  const devWithPort = (base: string) => `http://${slug}.${base}${port}${path}`;
  const prodUrl = (base: string) => `https://${slug}.${base}${path}`;

  // If explicit base domain is provided, honor it
  if (baseDomain) {
    const isLocal = baseDomain.toLowerCase().includes("localhost");
    return isLocal ? devWithPort(baseDomain) : prodUrl(baseDomain);
  }

  // Derive base from current host
  const lowerHost = (hostname || "").toLowerCase();
  if (lowerHost.endsWith("localhost")) {
    return devWithPort("localhost");
  }

  // Generic fallback: strip leading label to get base domain
  const parts = lowerHost.split(".");
  const base = parts.length > 1 ? parts.slice(1).join(".") : lowerHost;
  return prodUrl(base);
}


