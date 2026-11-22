create schema adigunbible_preview;
revoke all on schema adigunbible_preview from public, anon, authenticated;
grant usage on schema adigunbible_preview to authenticated;

create table adigunbible_preview.accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  registered_at timestamptz not null default now()
);

alter table adigunbible_preview.accounts enable row level security;
revoke all on adigunbible_preview.accounts from public, anon, authenticated;
grant select (user_id), insert (user_id) on adigunbible_preview.accounts to authenticated;

create policy read_own_account on adigunbible_preview.accounts
  for select to authenticated using (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  );

create policy register_own_account on adigunbible_preview.accounts
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (select auth.jwt() ->> 'is_anonymous') is distinct from 'true'
  );

create function public.adigunbible_preview_has_account()
returns boolean
language sql stable security invoker
set search_path = ''
as $$
  select exists (
    select 1 from adigunbible_preview.accounts
    where user_id = (select auth.uid())
  );
$$;

create function public.adigunbible_preview_register_account()
returns boolean
language sql volatile security invoker
set search_path = ''
as $$
  insert into adigunbible_preview.accounts (user_id)
  values ((select auth.uid()))
  on conflict (user_id) do nothing;
  select public.adigunbible_preview_has_account();
$$;

revoke execute on function public.adigunbible_preview_has_account() from public, anon, authenticated;
revoke execute on function public.adigunbible_preview_register_account() from public, anon, authenticated;
grant execute on function public.adigunbible_preview_has_account() to authenticated;
grant execute on function public.adigunbible_preview_register_account() to authenticated;

