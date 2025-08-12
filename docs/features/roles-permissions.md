Roles & Permissions — Model, Guards, and UI Integration

Short, high-signal reference for the authorization model, server guards, and the admin UI to manage roles and permissions per tenant.

Overview
- Per-tenant roles and grants with a global permission catalog
- Lowercase role keys are enforced on creation (e.g., admin, editor, billing_admin)
- Sentinel role member means “No role assigned” in the UI
- Server authorization via RPC user_has_permission and requirePermission(tenantId, perm)
- Admin-only UI to create/delete roles, edit role name/description, and toggle permissions per role

Data
- roles(tenant_id, key, name, description, created_at)
- permissions(key, description)
- role_permissions(tenant_id, role_key, permission_key, created_at)
- memberships(tenant_id, user_id, role_key, created_at) — assigns a role to a user; member treated as no role

Guards
- Primary gate: lib/utils/requirePermission.ts#requirePermission(tenantId, perm)
  - Calls RPC public.user_has_permission(t uuid, perm text)
  - Throws 401/403/500 errors for unauth/forbidden/errors
- Server actions use the user-scoped Supabase client to check auth, then may use the admin client for writes after validation
  - Example: membership role updates use admin client writes after members.manage passes to avoid RLS friction

UI (Admin)
- Settings → Roles (single tab)
  - Create role (lowercase key enforced); name/description stored per tenant
  - Edit role & permissions dialog:
    - Role name and description editable at the top
    - Permission groups are shown in a compact grid (1/2/3 cols responsive)
    - Each group shows a badge with selected/total counts
    - Save persists metadata first, then role permission grants
  - Delete role via confirm dialog (cannot delete member)
- Members → inline role selector
  - Shows member as “No role assigned”
  - Changing a role uses a mutation with a loading indicator and toasts
  - A member cannot change their own role

Server Actions (selected)
- server/permissions/roles.actions.ts
  - createRoleAction(tenantId, key, name, description?) — key normalized to lowercase
  - updateRoleAction(tenantId, key, { name?, description? })
  - deleteRoleAction(tenantId, key) — removes grants first; blocks deleting member
- server/permissions/role-permissions.actions.ts
  - listPermissions() — reads global catalog
  - setRolePermissions(tenantId, roleKey, permissionKeys[]) — replace strategy
- server/memberships/memberships.actions.ts
  - updateMemberRoleAction(tenantId, userId, newRoleKey) — server guard, blocks self-change, admin write for reliability, verifies update

UX Notes
- Keep role keys immutable once created; prefer creating a new role over renaming keys (renames are error-prone)
- Labels consistently refer to member as “No role assigned”
- Use shadcn components (Select, Checkbox, Dialog, Tabs, Confirm) and TanStack Query mutations for loading states and toasts

Acceptance Criteria (quick checks)
- Create/edit/delete roles in Settings for a tenant with appropriate guards
- Toggle permissions and see them persist; badge counts update after save
- Change a member’s role and see toast/refresh; self-change is blocked
- All UI loads and mutates with visible loading/disabled states

