# Docs

Short, high-signal references for the app.

Contents:
- `data-model.md`: current public tables and extensions
- `features/tenancy.md`: tenancy model, middleware behavior, and usage
- `features/auth.md`: authentication (routes, actions, middleware, env, Supabase)
- `features/integrations.md`: integration guides (OAuth, secrets, providers)


## Current snapshot (important)
- Multi-tenant via subdomain; middleware sets `x-tenant-slug`; see `features/tenancy.md` and `app/(app)/layout.tsx`.
- Authentication with Supabase; auth routes live under `app/auth/*`; see `features/auth.md`.
- Authorization helpers from Epic C: `requirePermission(tenantId, perm)`; audit logs in `audit_logs`;.
- Integrations framework in place; first provider: Google Gmail (OAuth + encrypted secrets). See `features/integrations-google-gmail.md`.



