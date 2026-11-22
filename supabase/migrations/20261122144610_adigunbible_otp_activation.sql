alter table adigunbible.accounts add column email_otp_verified_at timestamptz;
revoke select, insert on adigunbible.accounts from authenticated;
revoke select (user_id), insert (user_id) on adigunbible.accounts from authenticated;
grant select (user_id, email_otp_verified_at) on adigunbible.accounts to authenticated;
drop policy register_own_account on adigunbible.accounts;
revoke execute on function public.adigunbible_register_account() from public, anon, authenticated;

create table adigunbible.activation_key (
  singleton boolean primary key default true check (singleton),
  proof_hash bytea not null
);
alter table adigunbible.activation_key enable row level security;
revoke all on adigunbible.activation_key from public, anon, authenticated;

create or replace function public.adigunbible_has_account()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from adigunbible.accounts
    where user_id = (select auth.uid()) and email_otp_verified_at is not null
  );
$$;

create function adigunbible.activate_account(activation_proof text)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
  subject_id uuid := auth.uid();
begin
  if subject_id is null or auth.jwt() ->> 'is_anonymous' = 'true'
    or length(coalesce(activation_proof, '')) <> 72
    or not exists (
      select 1 from adigunbible.activation_key
      where proof_hash = pg_catalog.sha256(pg_catalog.convert_to(activation_proof, 'UTF8'))
    )
    or not exists (
      select 1 from pg_catalog.jsonb_array_elements(
        case when pg_catalog.jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end
      ) as method
      where method->>'method' = 'otp'
      and case when pg_catalog.jsonb_typeof(method->'timestamp') = 'number'
               then (method->>'timestamp')::numeric between
                 extract(epoch from pg_catalog.now()) - 600 and extract(epoch from pg_catalog.now()) + 30
               else false end
    ) then
    return false;
  end if;

  insert into adigunbible.accounts (user_id, email_otp_verified_at)
  values (subject_id, pg_catalog.now())
  on conflict (user_id) do update set email_otp_verified_at = excluded.email_otp_verified_at;
  return true;
end;
$$;

create function public.adigunbible_activate_account(activation_proof text)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select adigunbible.activate_account(activation_proof); $$;

revoke execute on function adigunbible.activate_account(text) from public, anon, authenticated;
revoke execute on function public.adigunbible_activate_account(text) from public, anon, authenticated;
grant execute on function adigunbible.activate_account(text) to authenticated;
grant execute on function public.adigunbible_activate_account(text) to authenticated;

