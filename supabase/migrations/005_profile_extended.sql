-- ============================================================
-- Modulo E: Profilo utente avanzato
-- Eseguire su Supabase > SQL Editor
-- ============================================================

-- Nuove colonne profilo
alter table public.profiles
  add column if not exists birth_date       date,
  add column if not exists nationality      text,
  add column if not exists gender           text,
  add column if not exists languages        text[] not null default '{}',
  add column if not exists travel_interests text[] not null default '{}';

-- Aggiorna il trigger di creazione profilo per leggere i nuovi campi
-- dai metadati utente passati durante la registrazione
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (
    id, username, full_name, avatar_url,
    birth_date, nationality, gender, languages, travel_interests
  )
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'avatar_url', ''),
    nullif(new.raw_user_meta_data->>'birth_date', '')::date,
    nullif(new.raw_user_meta_data->>'nationality', ''),
    nullif(new.raw_user_meta_data->>'gender', ''),
    coalesce(
      array(select jsonb_array_elements_text((new.raw_user_meta_data->'languages')::jsonb)),
      '{}'
    ),
    coalesce(
      array(select jsonb_array_elements_text((new.raw_user_meta_data->'travel_interests')::jsonb)),
      '{}'
    )
  );
  return new;
end;
$$;

-- Aggiunge la policy di update per tutti i campi del profilo
drop policy if exists "Utente può aggiornare il proprio profilo" on public.profiles;
create policy "Utente può aggiornare il proprio profilo"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Funzione per eliminare il proprio account (security definer → può toccare auth.users)
create or replace function public.delete_own_account()
returns void language plpgsql security definer
set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Non autenticato';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Consenti agli utenti autenticati di invocarla
grant execute on function public.delete_own_account() to authenticated;
