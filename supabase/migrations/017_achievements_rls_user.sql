-- Aggiunge una policy SELECT diretta su user_id = auth.uid()
-- Necessaria affinché Supabase Realtime consegni gli INSERT events
-- degli achievement all'utente che li ha guadagnati (il filtro Realtime
-- è user_id=eq.{uid} ma la policy precedente usa EXISTS su trip_members
-- che non è sempre risolta correttamente dal motore Realtime).

create policy "Utente vede i propri badge"
  on public.user_achievements for select to authenticated
  using (user_id = auth.uid());
