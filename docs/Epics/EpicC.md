# EPIC C — Roles, Permissions, and Audit (Authoritative Guide)

**Audience:** Future agentic coders on this project  
**Stack:** Next.js 14 (App Router) · Supabase Auth · Postgres + RLS

This document explains exactly what EPIC C added, why it exists, how to use it in code, and how to test it end-to-end. It assumes EPIC A (tenancy + middleware + auth) and EPIC B (baseline RLS + membership checks) are complete.

---

## 0) Summary of What EPIC C Delivers

- **Normalized authorization model**
  - `roles(tenant_id, key)` — per-tenant roles
  - `permissions(key)` — global permission catalog
  - `role_permissions(tenant_id, role_key, permission_key)` — per-tenant grants
- **Admin & permission helpers**
  - `util.user_is_admin(tenant_uuid) → boolean`
  - `util.user_has_permission(tenant_uuid, perm_key) → boolean`
  - Public RPC wrapper: `public.user_has_permission(t uuid, perm text) → boolean`
- **RLS policies** for roles and role_permissions:
  - **Members** can read; **Admins** can create/update/delete.
- **Audit logs**
  - `audit_logs(tenant_id, actor_user_id, action, resource, meta, created_at)`
  - Helper: `util.audit(tenant_uuid, action, resource, meta?)`
  - RLS: members can read only their tenant’s logs
- **App integration**
  - `requirePermission(tenantId, perm)` (server-only) to gate routes/actions
  - Layout membership gate (non-members redirected)
  - Debug page `/debug/authz` to verify permissions quickly

---

## 1) Schema (DDL) — Tables & Keys

> These already exist in the DB; included here for context and future migrations.

### 1.1 `roles`
```sql
create table if not exists public.roles (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  key text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  primary key (tenant_id, key)
);
