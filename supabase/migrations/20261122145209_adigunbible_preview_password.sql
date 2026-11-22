alter table adigunbible_preview.accounts add column login_email text unique;
alter table adigunbible_preview.accounts add column password_hash text;

revoke execute on function public.adigunbible_preview_activate_account(text) from public, anon, authenticated;

create function adigunbible_preview.activate_password_account(
  activation_proof text, email_address text, password_proof text
)
returns boolean language plpgsql volatile security definer set search_path = ''
as $$
declare
  subject_id uuid := auth.uid();
begin
  if subject_id is null or email_address is null
     or email_address is distinct from pg_catalog.lower(auth.jwt()->>'email')
     or password_proof is null or password_proof !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  if not adigunbible_preview.activate_account(activation_proof) then return false; end if;

  update adigunbible_preview.accounts
  set login_email = email_address,
      password_hash = extensions.crypt(password_proof, extensions.gen_salt('bf', 12))
  where user_id = subject_id and password_hash is null;

  return found;
end;
$$;

create function adigunbible_preview.password_sign_in(
  activation_proof text, email_address text, password_proof text
)
returns boolean language plpgsql stable security definer set search_path = ''
as $$
declare
  stored_hash text;
  candidate_hash text;
begin
  if activation_proof is null or length(activation_proof) <> 72
     or email_address is null or length(email_address) > 254
     or password_proof is null or password_proof !~ '^[0-9a-f]{64}$'
     or not exists (
       select 1 from adigunbible_preview.activation_key
       where proof_hash = pg_catalog.sha256(pg_catalog.convert_to(activation_proof, 'UTF8'))
     ) then
    return false;
  end if;

  select password_hash into stored_hash from adigunbible_preview.accounts
  where login_email = email_address and email_otp_verified_at is not null;
  candidate_hash := extensions.crypt(password_proof, coalesce(stored_hash, extensions.gen_salt('bf', 12)));
  return stored_hash is not null and candidate_hash = stored_hash;
end;
$$;

create function public.adigunbible_preview_activate_password_account(
  activation_proof text, email_address text, password_proof text
)
returns boolean language sql volatile security invoker set search_path = ''
as $$ select adigunbible_preview.activate_password_account(activation_proof, email_address, password_proof); $$;

create function public.adigunbible_preview_password_sign_in(
  activation_proof text, email_address text, password_proof text
)
returns boolean language sql stable security invoker set search_path = ''
as $$ select adigunbible_preview.password_sign_in(activation_proof, email_address, password_proof); $$;

revoke execute on function adigunbible_preview.activate_account(text) from public, anon, authenticated;
revoke execute on function adigunbible_preview.activate_password_account(text,text,text) from public, anon, authenticated;
revoke execute on function public.adigunbible_preview_activate_password_account(text,text,text) from public, anon, authenticated;
revoke execute on function adigunbible_preview.password_sign_in(text,text,text) from public, anon, authenticated;
revoke execute on function public.adigunbible_preview_password_sign_in(text,text,text) from public, anon, authenticated;
grant execute on function adigunbible_preview.activate_password_account(text,text,text) to authenticated;
grant execute on function public.adigunbible_preview_activate_password_account(text,text,text) to authenticated;
grant usage on schema adigunbible_preview to anon;
grant execute on function adigunbible_preview.password_sign_in(text,text,text) to anon;
grant execute on function public.adigunbible_preview_password_sign_in(text,text,text) to anon;

