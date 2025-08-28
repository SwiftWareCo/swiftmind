# Tenant Invites — Admin UI and Invite‑Only Onboarding

Short, high-signal reference for admin-managed tenant invites and the gated signup flow via invite links.

## Overview
- Admin-only invites UI lives on `/(app)/members` above the members table
- New users onboard only through invite links; no public sign-up page
- Accept page `/invite/accept` doubles as gated signup: sets Display name + Password, then accepts invite and redirects to the tenant dashboard

## Data
- `public.invites(id, tenant_id, email, role_key, token, created_by, created_at, expires_at, accepted_by, accepted_at, revoked_at)`
- `public.memberships(tenant_id, user_id, role_key, created_at)`
- `public.users(id, display_name, avatar_url, created_at)`

## SQL (RPCs)
- `public.accept_tenant_invite(p_token text, p_display_name text) returns jsonb`
  - SECURITY DEFINER, VOLATILE, `set search_path = public`
  - Validates token (pending/not expired/not revoked)
  - Ensures authenticated user email matches invite email (`auth.uid()` → `auth.users.email`)
  - Calls `public.ensure_user_profile(p_display_name, null)`
  - Inserts into `public.memberships` if not already a member
  - Marks invite accepted and returns `{ ok, tenant_id, tenant_slug, role_key }`
- `public.ensure_user_profile(p_display_name text, p_avatar_url text) returns void`
  - SECURITY DEFINER, VOLATILE; upsert into `public.users`
- `public.list_tenant_members(p_tenant uuid)`
  - Returns rows: `user_id, email, display_name, role_key, created_at`

## Server Actions (app code)
- Admin invites (tenant ops): `server/memberships/invites.actions.ts`
  - `createInviteAction(tenantId, email, roleKey)` - smart client selection for platform admins
  - `revokeInviteAction(tenantId, inviteId)` - smart client selection for platform admins
  - `inviteLinkForTokenAction(token)`
- Invite acceptance (auth onboarding): `server/auth/invite.actions.ts`
  - `completeInviteNewUserAction(token, displayName, password)`
    - Admin client: read invite by token (bypass RLS), create user (confirmed)
    - User-scoped server client: sign the new user in (sets cookies), set profile, call `accept_tenant_invite`
    - **Server-side redirect**: automatically redirects to tenant dashboard on success
  - `completeInviteAction(token, displayName, password)`
    - For already signed-in users: set password/profile, call RPC
    - **Server-side redirect**: automatically redirects to tenant dashboard on success
- Accept RPC wrapper: `server/tenants/tenants.actions.ts#acceptInviteAction`
  - Calls `.rpc("accept_tenant_invite", { p_token, p_display_name })`
- Invite lookup: `server/auth/invite-lookup.ts`
  - `lookupInviteByToken(token)` - safe server-side lookup for displaying tenant info
  - `validateInviteStatus(token)` - validation with detailed reason codes

## UI
- Invites Panel: `components/members/InvitesPanel.tsx`
  - Create Invite dialog (email + role) → copies link
  - Invites table with status Badge (Pending/Accepted/Revoked/Expired), Copy link, Revoke
  - Uses `formatDateTimeLocal` from `lib/utils/dates.ts`
- Members table: `components/members/MembersTable.tsx`
  - Uses RPC `list_tenant_members(p_tenant)` to show real names + emails
- Accept page: `app/invite/accept/page.tsx`
  - Auth-styled Card; inputs for Display name and Password (strength meter)
  - Submits to `completeInviteNewUserAction` (unauth) or `completeInviteAction` (auth)
  - On success, redirects to `/dashboard`, subdomain-aware if `NEXT_PUBLIC_APP_BASE_DOMAIN` is set

## Flow
1) Admin creates invite
   - Generates `token` (hex), sets `expires_at = now() + 14d`
   - Shares copied link: `https://<apex>/invite/accept?token=<token>`
2) Invitee opens link
   - Server-side invite lookup displays tenant name and role information
   - **Auto-redirect if already accepted**: If user is signed in with matching email, automatically redirects to tenant dashboard
   - **Smart handling for email mismatch**: Clear guidance if signed in with different email
   - Form to set Display name + Password (with strength meter)
   - New user path:
     - Admin client creates & confirms the user silently
     - Server client signs user in, sets profile, calls `accept_tenant_invite`
     - **Immediate server-side redirect** to tenant dashboard (no race conditions)
   - Existing user path:
     - Sets/updates password and profile, calls `accept_tenant_invite`
     - **Immediate server-side redirect** to tenant dashboard (no race conditions)
3) Status
   - Pending → Accepted on first successful acceptance
   - Revoked prevents acceptance; Expired prevents acceptance; both surface friendly errors
   - **Improved UX**: No more "already accepted" loops - seamless experience

## Security
- Admin client (service role) is used ONLY on the server for invite lookup and user creation
- All DB mutations run with server actions; no client secrets
- Accept RPC is SECURITY DEFINER + VOLATILE and enforces email match + tenant membership write atomically
- Use `supabase.auth.getUser()` (not `getSession()` user) for authenticated identity in server actions
- **Platform Admin Bypass**: Platform admins automatically bypass RLS and permission checks for invite operations
- **Smart Client Selection**: Invite actions use admin client for platform admins, regular client for tenant members

## Environment
- `SUPABASE_SERVICE_ROLE_KEY` for admin client (server only)
- `NEXT_PUBLIC_SITE_URL` to build absolute email redirects (if used elsewhere)
- `NEXT_PUBLIC_APP_BASE_DOMAIN` for subdomain redirects to `/dashboard` (e.g., `slug.domain.com`)

## Manual Test Plan
- Create invite for an email you own → link copies to clipboard
- Open link in a fresh browser session → set Display name + Password → **immediately redirected** to the tenant dashboard
- Verify `memberships` row created; `invites.accepted_by/accepted_at` set
- **Already accepted test**: Use same invite link while signed in with matching email → **auto-redirect** to dashboard
- **Email mismatch test**: Sign in with different email, use invite link → clear guidance with "Sign in as [correct email]" button
- Revoke a pending invite → acceptance fails with clear error
- Try accepting with a different signed-in email → error (email mismatch) with helpful guidance
- Members page shows display names (not UUIDs), dates in 12‑hour format via `formatDateTimeLocal`
- **No more race conditions**: Invite acceptance immediately redirects without showing "already accepted" messages
