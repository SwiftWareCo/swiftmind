### Tables

tenants
- id: uuid (pk)
- slug: text unique not null
- name: text not null
- created_at: timestamptz default now()

users
- id: uuid (pk) — mirrors auth.users via trigger
- created_at: timestamptz default now()

memberships
- id: uuid (pk)
- user_id: uuid references users(id)
- tenant_id: uuid references tenants(id)
- role_key: text not null
- created_at: timestamptz default now()

Extensions
- pgcrypto
- pgvector

Notes
- Trigger keeps `public.users` in sync with `auth.users`
- RLS/roles/embeddings deferred to later epics


