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
 * Build a tenant-scoped absolute URL for the given path.
 * - In development (localhost), preserves the current port and uses http.
 * - In production, uses https and NEXT_PUBLIC_APP_BASE_DOMAIN.
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


