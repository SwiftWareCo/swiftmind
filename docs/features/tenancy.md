# Tenancy & Middleware

- Root middleware resolves subdomain slug and sets header `x-tenant-slug`.
- `lib/utils/tenant.ts#getTenantSlug()` reads the header in server code.
- `app/(app)/layout.tsx` validates tenant via `server/data/tenants.data.ts#getTenantBySlug` and provides `{ tenantId, slug }` to children through `TenantProvider`.
- Server data access lives under `server/data/*` with strict types.

## How it flows
- Request → middleware parses Host → sets `x-tenant-slug`.
- Server component/layout → calls `getTenantSlug()` → resolves slug.
- Fetch tenant by slug → 404 if missing/unknown.
- Provide tenant context to route group children.

## Tips
- Prefer server components; keep `use client` minimal.
- Do not expose secrets to clients.
- Missing/unknown tenant should `notFound()`.


