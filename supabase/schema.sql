create extension if not exists pgcrypto;

create table if not exists public.app_users (
  id text primary key,
  auth_user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null unique,
  password text not null,
  role text not null check (role in ('head_admin', 'user')),
  login_token text,
  assigned_tenant_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tenants (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists app_users_auth_user_id_idx on public.app_users(auth_user_id);
create index if not exists app_users_email_idx on public.app_users(email);
create index if not exists tenants_data_page_id_idx on public.tenants((data->>'pageId'));

alter table public.app_users disable row level security;
alter table public.tenants disable row level security;
