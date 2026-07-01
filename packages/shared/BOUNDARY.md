# @repo/shared — confine client / server

Regola per il bundle **mobile (Metro)**: importare SOLO moduli client-safe.
I moduli server-only usano segreti (`SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`,
`OPENTRIPMAP_API_KEY`) e devono girare solo lato server (Next server actions,
Supabase Edge Functions). Non vanno mai nel bundle del client/mobile.

## ✅ Client-safe (web + mobile)

| Modulo | Contenuto |
|---|---|
| `index` / `types/database` | Tipi del dominio |
| `constants` | Interessi, lingue, generi |
| `countries` | 195 paesi ISO |
| `badges` | Definizioni badge (emoji) |
| `supabase/gamification` | **Costanti** punteggi: `POINTS`, `POINTS_GUIDE`, `BATHROOM_*`, `EventType` |
| `supabase/weather` | `fetchForecast` (Open-Meteo, nessuna chiave) + tipi |
| `supabase/overpassApi` | Orari apertura OSM (nessuna chiave) |
| `supabase/cache` | `SimpleCache` (puro) |

## ⛔ Server-only (Next actions / Edge Functions)

| Modulo | Perché |
|---|---|
| `supabase/gamification-server` | `getServiceClient`, `awardPoints*` → service role |
| `supabase/mvp`, `supabase/trip-end`, `supabase/daily-awards` | scritture service role |
| `supabase/badge-checker` | legge tutto il trip via service role |
| `supabase/packing` | seeding via service role + LLM |
| `supabase/agents` | LLM Groq (`GROQ_API_KEY`) |
| `supabase/enricher`, `supabase/openTripMap` | `OPENTRIPMAP_API_KEY` |

## Nota sulle operazioni privilegiate dal mobile

Il client mobile non ha il service role. Le operazioni privilegiate vanno:
1. **trigger Postgres `SECURITY DEFINER`** quando sono side-effect di un'azione
   primaria (es. assegnare punti su `INSERT reviews`), oppure
2. **Edge Function** autenticata col JWT dell'utente per logica LLM/orchestrazione.
