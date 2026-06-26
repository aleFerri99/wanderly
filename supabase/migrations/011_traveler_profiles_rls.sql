-- ============================================================
-- Modulo K: Agente Psicologo — RLS su traveler_profiles
-- La tabella è creata in 008 con solo SELECT policy.
-- Aggiunge INSERT (crea) e UPDATE (rigenera) per l'utente stesso.
-- ============================================================

create policy "Utente inserisce il proprio profilo viaggiatore"
  on public.traveler_profiles for insert to authenticated
  with check (user_id = auth.uid());

create policy "Utente aggiorna il proprio profilo viaggiatore"
  on public.traveler_profiles for update to authenticated
  using (user_id = auth.uid());
