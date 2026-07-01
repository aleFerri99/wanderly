-- ============================================================
-- Trivia multigiocatore sincronizzato
-- Stato autoritativo sulla sessione: current_q + q_started_at + reveal_at.
-- Tutti i client calcolano la domanda/tempo dagli stessi timestamp del server;
-- l'avanzamento è idempotente (CAS su current_q) via Edge Function service-role.
-- ============================================================

alter table public.trivia_sessions
  add column if not exists current_q    smallint,              -- -1/null = non iniziata, 0..N-1 = domanda corrente
  add column if not exists q_started_at timestamptz,           -- inizio (server) della domanda corrente; futuro = countdown "si parte"
  add column if not exists reveal_at    timestamptz;           -- se valorizzato: fase "mostra risposta" della domanda corrente

-- ── trivia_participants: presenze in lobby/partita ───────────
-- left_at valorizzato = ha lasciato → partecipazione annullata (risposte rimosse).
create table if not exists public.trivia_participants (
  session_id uuid not null references public.trivia_sessions(id) on delete cascade,
  user_id    uuid not null references public.profiles(id)        on delete cascade,
  joined_at  timestamptz not null default now(),
  left_at    timestamptz,
  primary key (session_id, user_id)
);

alter table public.trivia_participants enable row level security;

create policy "Partecipanti visibili ai membri"
  on public.trivia_participants for select to authenticated
  using (exists (
    select 1 from public.trivia_sessions s
    join public.trip_members tm on tm.trip_id = s.trip_id
    where s.id = trivia_participants.session_id and tm.user_id = auth.uid()
  ));
create policy "Utente entra per sé"
  on public.trivia_participants for insert to authenticated
  with check (user_id = auth.uid());
create policy "Utente aggiorna la propria presenza"
  on public.trivia_participants for update to authenticated
  using (user_id = auth.uid());

alter publication supabase_realtime add table public.trivia_participants;

-- Lasciare la partita annulla la partecipazione → l'utente cancella le proprie risposte.
create policy "Utente cancella le proprie risposte"
  on public.trivia_answers for delete to authenticated
  using (user_id = auth.uid());
