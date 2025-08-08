
---

## What ticket does this doc fall under?

Create a small “Docs/Onboarding” epic so it doesn’t get lost.

- **DOC-1 — Write Multi-Tenant Foundations Guide (Epic A+B)**  
  **Desc:** Produce `docs/multi-tenant-foundations.md` summarizing architecture, middleware, auth, RLS policies, and onboarding flows.  
  **AC:** File exists; new contributors can set up and validate tenancy in <15 min.  
  **Estimate:** 1  
  **Deps:** Epic A+B complete

---

## Next steps — ticketed (ready for your board)

### Epic C — Roles & Permissions + Audit
1) **C-1 — Roles table**
   - **Desc:** `roles(tenant_id, key, name)`; seed defaults per tenant.  
   - **AC:** Upsert safe; unique `(tenant_id,key)`.  
   - **Est:** 1

2) **C-2 — Permissions model**
   - **Desc:** `permissions(key)`, `role_permissions(tenant_id, role_key, permission_key)`.  
   - **AC:** Can assign/revoke; FK integrity.  
   - **Est:** 2  
   - **Deps:** C-1

3) **C-3 — SQL helper `util.user_has_permission(t, p)`**
   - **Desc:** SECURITY DEFINER function for server-side checks & future RLS.  
   - **AC:** Returns boolean; unit tests.  
   - **Est:** 1  
   - **Deps:** C-2

4) **C-4 — Audit logs**
   - **Desc:** `audit_logs(id, tenant_id, actor_user_id, action, resource, meta jsonb, created_at)`; server middleware to write entries on mutations.  
   - **AC:** Visible per tenant; filterable.  
   - **Est:** 2

5) **C-5 — App gates**
   - **Desc:** Server guards `requirePermission('templates.read')` pattern wired into server actions.  
   - **AC:** Unauthorized gets 403 + audit.  
   - **Est:** 2  
   - **Deps:** C-3, C-4

### Epic D — Secrets & OAuth for Integrations
6) **D-1 — Integration secrets**
   - **Desc:** `integration_secrets(id, tenant_id, provider, encrypted jsonb, created_at)`; encryption wrapper.  
   - **AC:** No plaintext; rotation script stub.  
   - **Est:** 2

7) **D-2 — OAuth broker route**
   - **Desc:** `/api/oauth/:provider/callback` stores tokens in `integration_secrets` (refresh logic).  
   - **AC:** Connect/disconnect for 1–2 providers (e.g., Gmail, HubSpot).  
   - **Est:** 3  
   - **Deps:** D-1

### Epic E — MCP Framework
8) **E-1 — MCP registry tables**
   - **Desc:** `mcp_providers`, `mcp_connections`, `mcp_tools`.  
   - **AC:** Tenant admin can connect a provider; status tracked.  
   - **Est:** 2

9) **E-2 — Tool Router service**
   - **Desc:** `invokeMcpTool({tenantId, tool, params})` with retries + idempotency.  
   - **AC:** One end-to-end call works (e.g., Smartlead “update lead”).  
   - **Est:** 3  
   - **Deps:** E-1

10) **E-3 — Background jobs**
    - **Desc:** pg-boss worker; idempotent jobs; at-least-once delivery.  
    - **AC:** Long task demo (batch update) succeeds; audit logged.  
    - **Est:** 3  
    - **Deps:** E-2

### Epic F — RAG Data Plane
11) **F-1 — KB schema**
    - **Desc:** `kb_sources`, `kb_docs`, `kb_chunks(vector(1536), allowed_roles[])` + HNSW index.  
    - **AC:** Migrations created; indexes healthy.  
    - **Est:** 2

12) **F-2 — Ingestion pipeline**
    - **Desc:** Upload → chunk → embed → store; per-tenant quotas; retries.  
    - **AC:** One doc source ingested; progress visible.  
    - **Est:** 3  
    - **Deps:** F-1

13) **F-3 — Retrieval API**
    - **Desc:** Role-scoped top-k over `kb_chunks` + citations.  
    - **AC:** Support role can’t see Admin-only chunks.  
    - **Est:** 2  
    - **Deps:** F-1, C-3

---

If you want, I can spin up **C-1/C-2 SQL** now so you can paste it straight into Supabase and keep the momentum.
