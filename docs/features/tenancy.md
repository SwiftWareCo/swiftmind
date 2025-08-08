# Tenancy & Middleware

- Root middleware resolves subdomain slug and sets header `x-tenant-slug`.
- `lib/utils/tenant.ts#getTenantSlug()` reads the header in server code.
- `app/(app)/layout.tsx` validates tenant via `server/data/tenants.data.ts#getTenantBySlug` and provides `{ tenantId, slug }` to children through `TenantProvider`.
- Server code is grouped by domain under `server/<domain>/...`:
  - Data fetching in `<resource>.data.ts` files, e.g. `server/data/tenants.data.ts`
  - Mutations/server actions in `<feature>.actions.ts` files, e.g. `server/auth/auth.actions.ts`
  - Avoid one-file-per-function; prefer cohesive files per resource/feature.

## How it flows
- Request → middleware parses Host → sets `x-tenant-slug`.
- Server component/layout → calls `getTenantSlug()` → resolves slug.
- Fetch tenant by slug → 404 if missing/unknown.
- Provide tenant context to route group children.

## Tips
- Prefer server components; keep `use client` minimal.
- Do not expose secrets to clients.
- Missing/unknown tenant should `notFound()`.


