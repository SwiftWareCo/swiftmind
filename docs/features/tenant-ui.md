# Tenant UI — Operator-Provisioned Onboarding (Outline)

- Multi-tenant app using Next.js App Router (server components + server actions)
- Supabase Auth + middleware sets `x-tenant-slug` from subdomain
- Operator creates tenants and initial admin memberships outside the app
- No route handlers; RLS enforced by Supabase

## Access Gating
- Signed-in user with 0 memberships → redirect to `/no-access`
- `/no-access`: invite-only message + Sign Out + Contact Support
- Has memberships but not a member of current slug → friendly block with Tenant Switcher

## Tenant Shell (shadcn/ui)
- Layout provides sidebar + header for all routes under `/(app)`
- Header: Tenant Switcher, space for user menu/search
- Sidebar: Dashboard, Chat, Knowledge, Connections; Admin-only: Members, Audit, Settings, Onboarding

## Routes (server components)
- `/dashboard` — KPI cards (Knowledge, Connections, Members) + Recent Activity
- `/chat` — Placeholder for tenant chat (grounded answers with citations later)
- `/knowledge` — Upload + table of docs with ingest status (admin upload)
- `/connections` — Gmail connect/disconnect; status (admin-only)
- `/members` — Paginated members table (admin-only)
- `/audit` — Paginated audit log table (admin-only)
- `/settings` — Organization; Assistant (versioned prompt) and RAG tabs (admins can mutate via `settings.manage`; members read-only)
- `/onboarding` — Admin-only wizard: bring data (upload, optional Gmail) → finish

## Guards & Permissions
- Server-enforced with `requirePermission(tenantId, perm)`
- Admin-only pages/actions require `members.manage`
- Never rely on hide-only; UI visibility matches server checks

## Data & Querying
- Reads via TanStack Query (client) + Supabase browser client
- Tables are paginated with shared `PaginationControls` component
- Mutations via server actions only

## Visual Design (shadcn/ui)
- `Card`, `Button`, `Table`, `AlertDialog`, `Badge` (status)
- Generic `loading.tsx` spinner for route group
- Empty states: concise copy with primary CTA

## Audit Logging
- Major actions write to `audit_logs`: `kb.ingest`, `kb.delete`, `integration.connect/disconnect/refresh`, `chat.answer` (future)

## Notes / Non-goals
- No self-serve org creation
- Invites out of scope for this ticket (placeholder guidance only)
- Chat UX will be built later; retrieval wiring exists
