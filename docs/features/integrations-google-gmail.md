# Google Gmail Integration

Short, high-signal reference for multi-tenant Gmail via OAuth, server components, and server actions only.

## Overview
- Server-only crypto for secrets: `lib/utils/crypto.server.ts` (AES-256-GCM)
- OAuth helpers: `lib/utils/oauth.server.ts` (PKCE, endpoints, scopes)
- Connect/disconnect/callback server actions: `server/integrations/google.actions.ts`
- Token lifecycle manager: `server/integrations/tokenManager.ts`
- Email send action: `server/email/email.actions.ts`
- Admin UI: `app/(app)/connections/page.tsx`

## Data
- `oauth_states(state, code_verifier, tenant_id, user_id, redirect_to, created_at)`
- `integration_secrets(tenant_id, provider, ciphertext, nonce, key_version, created_at, updated_at)`
- Audit: `audit_logs(tenant_id, actor_user_id, action, resource, meta, created_at)`

## Permissions
- New permission: `email.send`
- Provisioned per-tenant (idempotent) to roles `admin` and `operations`
- Guarded with `requirePermission(tenantId, 'email.send')`

## Token Manager
- `getGoogleAccessToken(tenantId)` decrypts credentials, computes `expires_at`, refreshes ~60s early via Google token endpoint
- On refresh success: re-encrypt and upsert to `integration_secrets`, audit `integration.refresh` success
- On refresh failure: audit failure; if `invalid_grant` or missing refresh token → surface "Needs attention" (UI will offer Reconnect)
- Handles parallel refreshes by re-reading after a failed write to use the winner’s token

## Sending Email
- `sendTestEmailAction(tenantId, to?)`
  - Ensures permission exists and checks guard
  - Uses Token Manager for a valid access token
  - Sends minimal RFC 2822 message via Gmail `users.messages.send`
  - Audits `email.send` with `{ to, status, messageId? }`
  - Returns `{ ok: true, messageId }` or `{ ok: false, error }` (no token logging)

## UI Behavior
- `/connections`:
  - Shows Gmail status: Connected (with last update), Needs attention (Reconnect CTA), Not connected
  - "Send test email" server action posts; result shown inline via short-lived cookie (Option A flash)
  - Connect/Disconnect controlled by server actions

## Environment
- `INTEGRATION_KEY_V1_BASE64` (base64-encoded 32-byte key)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`

## Security Notes
- Secrets never leave the server; all DB access uses SSR Supabase client
- No plaintext tokens in logs
- Respect RLS; use tenant-bound access everywhere


