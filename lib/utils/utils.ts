import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format bytes as human-readable text.
 * 
 * @param bytes Number of bytes.
 * @param si True to use metric (SI) units, aka powers of 1000. False to use 
 *           binary (IEC), aka powers of 1024.
 * @param dp Number of decimal places to display.
 * 
 * @return Formatted string.
 */
export function formatBytes(bytes: number, si: boolean = false, dp: number = 1): string {
  const thresh = si ? 1000 : 1024;

  if (Math.abs(bytes) < thresh) {
    return bytes + ' B';
  }

  const units = si 
    ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'] 
    : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
  let u = -1;
  const r = 10**dp;

  do {
    bytes /= thresh;
    ++u;
  } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

  return bytes.toFixed(dp) + ' ' + units[u];
}

/**
 * 🌐 CLIENT-SIDE Tenant URL Builder
 * 
 * Use this function in CLIENT COMPONENTS (browser-side)
 * - Components marked with "use client"
 * - Event handlers and onClick functions
 * - Browser-only code that needs window.location
 * 
 * @param tenantSlug - The tenant subdomain slug (e.g., "acme")
 * @param path - The path within the tenant (e.g., "/dashboard")
 * @param baseDomain - Optional base domain override
 * @returns Full URL with tenant subdomain and port (e.g., "http://acme.localhost:3000/dashboard")
 * 
 * @example
 * // In a client component:
 * import { buildTenantUrl } from "@/lib/utils/utils";
 * const url = buildTenantUrl("acme", "/dashboard");
 * window.location.href = url;
 */
export function buildTenantUrl(tenantSlug: string, path: string, baseDomain?: string): string {
  // Use provided base domain or environment variable
  const configuredBaseDomain = baseDomain || process.env.NEXT_PUBLIC_APP_BASE_DOMAIN;
  
  if (configuredBaseDomain) {
    // Production: Use configured base domain (e.g., app.swiftware.ca)
    const isLocal = configuredBaseDomain.toLowerCase().includes("localhost");
    const protocol = isLocal ? "http" : "https";
    
    // Handle port for localhost development
    if (isLocal && typeof window !== "undefined") {
      const currentHost = window.location.host; // e.g., "localhost:3000"
      const port = currentHost.includes(":") ? currentHost.split(":")[1] : "";
      const portPart = port ? `:${port}` : "";
      return `${protocol}://${tenantSlug}.${configuredBaseDomain}${portPart}${path}`;
    }
    
    // Production: No port needed
    return `${protocol}://${tenantSlug}.${configuredBaseDomain}${path}`;
  }
  
  // Fallback: Use current host but replace subdomain
  if (typeof window !== "undefined") {
    const currentHost = window.location.host; // e.g., "localhost:3000"
    const hostParts = currentHost.split(".");
    
    if (hostParts.length === 1) {
      // localhost:3000 case - append subdomain
      return `${window.location.protocol}//${tenantSlug}.${currentHost}${path}`;
    } else {
      // Remove existing subdomain and add new one
      const baseHost = hostParts.slice(1).join(".");
      return `${window.location.protocol}//${tenantSlug}.${baseHost}${path}`;
    }
  }
  
  // Server-side fallback
  return `http://${tenantSlug}.localhost:3000${path}`;
}
