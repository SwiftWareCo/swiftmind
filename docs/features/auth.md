# Authentication

Short, high-signal reference for the authentication feature (Supabase + Next.js).

## Overview
- Supabase Auth handles email/password, email confirmations, and password resets
- Auth pages live at the apex domain under `app/auth/*`
- Tenant app is protected behind middleware and lives under `app/(app)/*`

## Routes
- `/auth/login`
- `/auth/sign-up` (hidden when `NEXT_PUBLIC_INVITE_ONLY_MODE=true`)
- `/auth/forgot-password`
- `/auth/update-password`
- `/auth/confirm` (email redirect target)
- `/auth/error` (generic error surface)
- `/invite/accept` (invite-only onboarding)

## Server actions
- File: `server/auth/auth.actions.ts`
- Actions:
  - `signInWithPassword`
  - `signUpWithPassword` (uses email confirmation with redirect)
  - `sendPasswordReset` (email reset with redirect)
  - `updatePassword`
  - `signOut`
  - `resendConfirmationEmail`
  - `resendPasswordResetEmail`

- File: `server/auth/invite.actions.ts`
- Actions:
  - `completeInviteAction` (for existing users)
  - `completeInviteNewUserAction` (for new users)
  - Both actions now automatically redirect to tenant dashboard on success

Notes:
- Uses `await createClient()` from `server/supabase/server.ts`
- Avoid passing cookie stores; the client helper handles cookies
- Always generate absolute URLs for email redirects (see env vars)
- Invite actions use server-side redirects to prevent race conditions

## Middleware
- Root `middleware.ts` resolves tenant slug into header `x-tenant-slug`
- Auth protection in `server/supabase/middleware.ts`:
  - Redirects unauthenticated users to `/auth/login`
  - Public paths: `/auth/*` (and `/` if you add a public landing)

## Invite-Only Mode
- Environment variable: `NEXT_PUBLIC_INVITE_ONLY_MODE=true`
- When enabled:
  - `/auth/sign-up` redirects to invite-only message
  - Public signup is hidden across the application
  - Only `/invite/accept` provides user onboarding
  - Middleware automatically redirects signup attempts

## UI
- Auth components grouped under `components/auth/*`:
  - `AuthShell` (shared card with Aurora background and glass morphism)
  - `LoginForm`, `ForgotPasswordForm`, `UpdatePasswordForm`
  - `InviteAcceptForm` (for invite-only onboarding)
  - `AuroraBackground` (GPU-accelerated animated background)
- Keep components client-only where necessary; server actions provide mutations
- Error-first UX with inline error display and loading states

