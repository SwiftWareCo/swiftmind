# Backoffice — Platform Admin Console

Short, high-signal reference for the operator-only backoffice at `/backoffice`.

## Overview
- Server components + server actions only; no route handlers
- Guarded by platform admin check (operators only)
- Features:
  - Create Tenant (optional initial admin email)
  - Tenants list (name, slug, created_at, member count)
  - Tenant detail (members, invites, integrations status — read-only)
- UI uses shadcn (`Card`, `Table`, `Input`, `Button`, `AlertDialog`) and toasts
- Minimal client code for form UX (loading, toasts) via `useActionState` and Sonner

## Access & Guard
- Guard helper: `server/platform/platform-admin.data.ts`
  - `isPlatformAdmin()` — checks `platform_admins` for `auth.user().id`
  - `requirePlatformAdmin()` — throws "401/403" on unauth/forbidden
- Pages
  - `/backoffice` and `/backoffice/[slug]` call `requirePlatformAdmin()` at the top

## Data & Dependencies
- Tables: `tenants`, `memberships`, `roles`, `role_permissions`, `invites`, `integration_secrets`, `platform_admins`, `users`
- Admin client (service role): `server/supabase/admin.ts`
  - Used to bypass RLS for operator reads/writes
- Public mirror of auth users must include `email` so member lists can show email
  - Keep `public.users(id, email, display_name, avatar_url, created_at, updated_at)` in sync from `auth.users`
  - SECURITY DEFINER triggers recommended

## Server Actions
- File: `server/tenants/tenants.actions.ts`
  - `createTenantAction(name, slug, initialAdminEmail?)` → `{ ok, tenant, createdAdmin? }`
    - Create tenant
    - Seed roles: `admin`, `operations`, `member`
    - Seed grants: `admin` → all permissions; `operations` → `email.send` (if present)
    - If `initialAdminEmail` exists in auth: add admin membership
    - If not, create auth user with temporary password (confirmed) and add membership; return `{ createdAdmin: { email, userId, temporaryPassword } }`
  - `acceptInviteAction(token, displayName?)` (RPC wrapper) — unchanged

## Pages & UI
- `/backoffice` (server component)
  - Create Tenant section: `components/backoffice/CreateTenantForm.tsx`
    - Client component using `useActionState` + `useFormStatus` for loading
    - Calls server action; shows toasts; revalidates list
  - Tenants table: SSR list with `name`, `slug`, `created_at`, `member_count`, Detail link
- `/backoffice/[slug]` (server component)
  - Tenant header (name, slug, created)
  - Members table (read-only): server-side via admin client join `memberships → users`
  - Invites table (read-only): server-side from `invites`
  - Connections card: Gmail status via `integration_secrets`

## Behavior & Edge Cases
- Initial admin provisioning
  - If email not found in auth, a user is created with a temporary password (email confirmed) and an admin membership is inserted
  - Operator should share the temp password securely; admin should change it after first login
- Member emails
  - Requires `public.users.email` mirror; otherwise join returns empty emails
- Revalidation
  - After successful create, the list page revalidates via `revalidatePath("/backoffice")`

## DB Notes (FKs & Deletes)
- Tenant deletion should cascade across tenant-scoped data:
  - `roles`, `role_permissions`, `memberships`, `invites`, `oauth_states`, `integration_secrets`, `kb_*`, `audit_logs` → `ON DELETE CASCADE`
- Role relationships
  - `role_permissions(tenant_id, role_key)` → `roles(tenant_id, key)` `ON DELETE CASCADE`
  - `memberships.role_key` may use `ON DELETE SET DEFAULT` with default `'member'`
- User relationships
  - `memberships.user_id` → `users.id` `ON DELETE CASCADE`
  - Actor/author pointers (`created_by`, `accepted_by`, `actor_user_id`) → `ON DELETE SET NULL` and columns nullable

## Acceptance Criteria
- Only platform admins can access `/backoffice` (403 for others)
- Creating a tenant seeds roles/permissions and (optionally) an initial admin membership
- Tenants list & detail load with expected data; links work
- UI shows loading on submit; success/toast visible

## Manual Test Plan
1) Promote your user into `platform_admins`
2) Visit `/backoffice`
3) Create a tenant with an existing user as initial admin → verify admin membership created
4) Create a tenant with a new email → verify auth user created (temp password surfaced in toast) and admin membership
5) Visit `/backoffice/[slug]` → members, invites, and Gmail status render
6) Delete a test auth user and/or tenant to confirm FKs behave as intended
