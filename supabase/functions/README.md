# Edge Functions (Deno)

Backend privilegiato di Wanderly, condiviso tra **web** e **mobile**.
Le funzioni girano su Deno nel runtime Supabase. Il client (web/mobile) le chiama
con `supabase.functions.invoke('<nome>')`: il JWT dell'utente viaggia in automatico
nell'header `Authorization`, quindi dentro la function sappiamo **chi** è e cosa può fare.

## Struttura

```
supabase/functions/
  _shared/
    cors.ts      # header CORS + helper json()
    client.ts    # userClient (RLS) / adminClient (service-role) / getUser / isTripMember
  hello/
    index.ts     # smoke test: valida JWT + verifica segreti
```

Pattern di ogni function:
1. `getUser(req)` → valida il JWT (401 se assente).
2. `isTripMember(req, tripId, user.id)` → autorizza sulla risorsa.
3. Logica privilegiata con `adminClient()` (bypassa RLS) **solo dopo** i controlli sopra.

## Prerequisiti (una volta)

```bash
# Supabase CLI installata + Docker in esecuzione
supabase login
supabase link --project-ref tocvrknzhhnvuumoxvwj   # ref del progetto (dalla URL Supabase)
```

## Segreti

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` sono **iniettati
automaticamente** — non vanno impostati. Imposta solo le chiavi esterne:

```bash
supabase secrets set GROQ_API_KEY=xxxxx GEOAPIFY_KEY=xxxxx
supabase secrets list
```

- `GROQ_API_KEY` — obbligatoria (agenti AI).
- `GEOAPIFY_KEY` — usata dall'enricher (riusa il valore di `NEXT_PUBLIC_GEOAPIFY_KEY` del web).
- `OPENTRIPMAP_API_KEY` — **opzionale**: l'enricher la preferisce se presente, altrimenti
  fa fallback su Geoapify. Non necessaria per partire.

## Sviluppo locale

```bash
# .env per il serve locale (NON committare)
echo "GROQ_API_KEY=xxxxx"        >  supabase/.env.local
echo "OPENTRIPMAP_API_KEY=xxxxx" >> supabase/.env.local

supabase functions serve hello --env-file supabase/.env.local
```

## Deploy

```bash
supabase functions deploy hello
# tutte insieme: supabase functions deploy
```

## Test (smoke)

Da app autenticata:

```ts
const { data, error } = await supabase.functions.invoke('hello')
// → { message, userId, email, secrets: { groq, opentripmap }, ts }
```

Da curl (serve un access_token valido di un utente):

```bash
curl -i -X POST "https://tocvrknzhhnvuumoxvwj.supabase.co/functions/v1/hello" \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json"
```

## Function: `suggestions`

Porta `refreshTripSuggestions` (web server action) su Supabase. Orchestrazione:
**meteo (Open-Meteo) → Enricher (luoghi reali) → agenti Groq (Meteorologo / Travel
Planner / Itinerary Planner) → scrive `trip_suggestions`**. Tutte le query usano il client
user-scoped (RLS): l'utente deve essere membro del viaggio. Logica e prompt portati 1:1 da
`packages/shared/supabase/` in `_shared/{weather,enricher,openTripMap,overpassApi,cache,agents}.ts`.

- Segreto richiesto: `GROQ_API_KEY`.
- Enricher: `GEOAPIFY_KEY` (consigliato) e/o `OPENTRIPMAP_API_KEY` (opzionale). Senza chiavi
  l'enricher restituisce fallback e i suggerimenti funzionano comunque (solo meno arricchiti).
  Gli orari di apertura (Overpass/OSM) non richiedono chiave.
- L'enricher arricchisce al massimo `ENRICH_CAP` (12) attività per restare nei limiti di
  tempo della Edge Function (Overpass fa chiamate sequenziali fino a ~12s l'una).
- Body: `{ "tripId": "<uuid>" }`. Risposta: `{ success, count, enricher? }` oppure `{ error }`
  (`MISSING_PROFILES` se mancano i profili viaggiatore).

```bash
supabase functions deploy suggestions --project-ref tocvrknzhhnvuumoxvwj
```

Client (web/mobile):
```ts
const { data } = await supabase.functions.invoke('suggestions', { body: { tripId } })
```

> ⚠️ Tenere i moduli `_shared/{weather,enricher,openTripMap,overpassApi,cache,agents}.ts`
> in sync con i sorgenti `packages/shared/supabase/`. Sono duplicati perché Deno richiede
> import con estensione `.ts` e `Deno.env`, incompatibili con la build Next del pacchetto.

## Function: `psicologo`

Porta `generateMyTravelerProfile` (web). L'utente genera il **proprio** profilo viaggiatore:
legge la sua riga `profiles`, esegue l'agente Groq (`runPsicologoAgent`), fa upsert in
`traveler_profiles` (onConflict `user_id,trip_id`). Tutto via client user-scoped (RLS):
ognuno scrive solo il proprio profilo, nessun service-role.

- Segreto richiesto: `GROQ_API_KEY`.
- Body: `{ "tripId": "<uuid>" }`. Risposta: `{ success, profile }` oppure `{ error }`.

```bash
supabase functions deploy psicologo --project-ref tocvrknzhhnvuumoxvwj
```

> Nota: il web ha anche `generateAllTravelerProfiles` (service-role, genera i profili di
> tutti i membri in blocco). Su mobile ogni utente genera il proprio profilo — più semplice
> e senza privilegi elevati. Volendo si può aggiungere una variante service-role in seguito.

## Function: `trivia`

Porta la parte AI/privilegiata del quiz di gruppo. È la **prima function che usa
`adminClient()`** (service-role) per finalizzare (assegna punti agli altri utenti + badge).
Le operazioni semplici (avvio sessione, invio risposta, lettura) restano client-direct via RLS.

Azioni (`body.action`):
- `'create'` `{ tripId, destination }` → pulisce sessioni vecchie (admin), genera **5 domande**
  (Groq), crea sessione `waiting`. Risposta `{ sessionId }`.
- `'finalize'` `{ sessionId, tripId, force? }` → calcola i punteggi (100 base + bonus velocità),
  assegna +15 `trivia_winner` e il badge `cervellone_viaggio` al/i vincitore/i, segna `finished`.
  Senza `force` finalizza solo quando tutti i partecipanti hanno risposto a tutte le domande.

- Segreto richiesto: `GROQ_API_KEY` (service-role auto-iniettata).
- ⚠️ Lo schema (`trivia_answers.question_idx between 0 and 4`) ammette **5 domande**: il web ne
  generava 10 (bug latente, gli insert idx>4 fallivano). La function genera 5, coerente con lo schema.
- Niente auto-delete dopo 90s (Edge non esegue codice dopo la risposta): le sessioni `finished`
  vengono ripulite al `create` successivo. Le sessioni `finished` non bloccano nuove sfide.

```bash
supabase functions deploy trivia --project-ref tocvrknzhhnvuumoxvwj
```

## Function: `packing`

Porta `seedPackingForUser` (web). Genera/clona la packing list personale dell'utente
corrente in `group_board` (content_type `packing`). Usa service-role per leggere/scrivere
`trips.packing_template`. Body: `{ tripId }`. Idempotente (salta se la valigia esiste già).

```bash
supabase functions deploy packing --project-ref tocvrknzhhnvuumoxvwj
```

## Function: `review`

Porta `upsertReview` (web). Upsert recensione attività/tappa (RLS) + assegna punti
(`review_vote` +10, `review_text` +10) e controlla i badge on-review (`critico_severo`,
`forchetta_oro`) via service-role. Body: `{ action: 'upsert', tripId, score, content?, activityId?, dayId? }`.

```bash
supabase functions deploy review --project-ref tocvrknzhhnvuumoxvwj
```

## Deploy di tutte le function insieme

```bash
supabase functions deploy --project-ref tocvrknzhhnvuumoxvwj
```

Function attive: `hello`, `suggestions`, `psicologo`, `trivia`, `packing`, `review`.
Richiedono solo `GROQ_API_KEY` (più `GEOAPIFY_KEY` opzionale per l'enricher).
