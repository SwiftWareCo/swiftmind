# Authentication

Short, high-signal reference for the authentication feature (Supabase + Next.js).

## Overview
- Supabase Auth handles email/password, email confirmations, and password resets
- Auth pages live at the apex domain under `app/auth/*`
- Tenant app is protected behind middleware and lives under `app/(app)/*`

## Routes
- `/auth/login`
- `/auth/sign-up`
- `/auth/forgot-password`
- `/auth/update-password`
- `/auth/confirm` (email redirect target)
- `/auth/error` (generic error surface)

## Server actions
- File: `server/auth/auth.actions.ts`
- Actions:
  - `signInWithPassword`
  - `signUpWithPassword` (uses email confirmation with redirect)
  - `sendPasswordReset` (email reset with redirect)
  - `updatePassword`
  - `signOut`

Notes:
- Uses `await createClient()` from `server/supabase/server.ts`
- Avoid passing cookie stores; the client helper handles cookies
- Always generate absolute URLs for email redirects (see env vars)

## Middleware
- Root `middleware.ts` resolves tenant slug into header `x-tenant-slug`
- Auth protection in `server/supabase/middleware.ts`:
  - Redirects unauthenticated users to `/auth/login`
  - Public paths: `/auth/*` (and `/` if you add a public landing)

## UI
- Auth components grouped under `components/auth/*`:
  - `AuthShell` (shared card + subtle gradient/blur background)
  - `LoginForm`, `SignUpForm`, `ForgotPasswordForm`, `UpdatePasswordForm`
- Keep components client-only where necessary; server actions provide mutations

