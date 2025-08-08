# SwiftMind

SwiftMind is a platform for AI and RAG based applications

## Multi-tenant setup

This app uses subdomain-based tenancy. The `middleware.ts` resolves a tenant slug from the request hostname and sets an `x-tenant-slug` header for server components/actions.

- Set `NEXT_PUBLIC_APP_BASE_DOMAIN` to your apex domain (e.g. `swiftmind.app`)
- Local dev supports `slug.localhost` if your environment resolves that

Server utilities are in `lib/tenant.ts` and `server/supabase/queries.ts`.

### Supabase environment

Create `.env.local` with:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_APP_BASE_DOMAIN=localhost
```

Do not expose service role keys to the client.

### Database schema

Schema is provisioned via SQL in the Supabase UI (SQL Editor):

- `tenants(id, slug, name, created_at)`
- `users(id, created_at)`
- `memberships(id, user_id, tenant_id, role_key, created_at)`
- Triggers mirror `auth.users` to `public.users`
- `pgcrypto` and `pgvector` extensions are enabled

Run the provided SQL in the Supabase UI SQL Editor. No RLS/roles/embeddings ingestion yet.
