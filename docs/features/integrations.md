git # Integrations (Overview)

This page documents external integrations that require OAuth and/or secret storage.

## Architecture
- Server-only utilities for crypto and OAuth helpers:
  - `lib/utils/crypto.server.ts` — AES-256-GCM encrypt/decrypt of JSON
  - `lib/utils/oauth.server.ts` — PKCE helpers + Google endpoints
- Server Actions for connect/disconnect/callback flows:
  - Grouped under `server/integrations/*`
- UI surfaces
  - Admin-only `/connections` (server component)
  - Fixed callback pages under `/oauth/<provider>/callback` (server component)

## Data
- `oauth_states(state, code_verifier, tenant_id, user_id, redirect_to, created_at)`
- `integration_secrets(tenant_id, provider, ciphertext, nonce, key_version, created_at, updated_at)`
- Audit: `audit_logs(tenant_id, actor_user_id, action, resource, meta, created_at)`

## Security
- Secrets are never sent to the client; stored encrypted with `INTEGRATION_KEY_V1_BASE64`.
- Only server actions mutate integration state; gated via `requirePermission(tenantId, 'members.manage')`.
- Callback is a single fixed URI; tenant bound via `state` row.

## Implemented Providers
- Google Gmail — see `features/integrations-google-gmail.md`.
