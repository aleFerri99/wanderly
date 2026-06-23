# Wanderly — Modulo A: Auth + Gestione Gruppo

## Setup in 5 passi

### 1. Installa le dipendenze
```bash
npm install
```

### 2. Crea il progetto Supabase
1. Vai su [supabase.com](https://supabase.com) e crea un nuovo progetto
2. Copia l'URL e la `anon key` da **Project Settings → API**

### 3. Configura le variabili d'ambiente
```bash
cp .env.example .env.local
# Poi edita .env.local con i tuoi valori Supabase
```

### 4. Esegui la migration del database
Nel tuo progetto Supabase:
1. Vai su **SQL Editor**
2. Incolla ed esegui il contenuto di `supabase/migrations/001_module_a.sql`

### 5. Configura l'autenticazione Google (opzionale)
1. Supabase → **Authentication → Providers → Google**
2. Aggiungi le credenziali OAuth da [Google Cloud Console](https://console.cloud.google.com)
3. Aggiungi `https://xxxx.supabase.co/auth/v1/callback` come redirect URI

### 6. Avvia il server di sviluppo
```bash
npm run dev
# → http://localhost:3000
```

---

## Struttura file — Modulo A

```
src/
├── app/
│   ├── auth/
│   │   ├── actions.ts          ← Server Actions: signIn, signUp, signOut
│   │   ├── callback/route.ts   ← Handler OAuth redirect
│   │   ├── login/page.tsx      ← UI Login
│   │   └── register/page.tsx   ← UI Registrazione
│   ├── dashboard/
│   │   └── page.tsx            ← Lista viaggi dell'utente
│   ├── trip/
│   │   ├── actions.ts          ← Server Actions: createTrip, joinTrip, leaveTrip
│   │   └── [id]/page.tsx       ← Pagina viaggio con membri + presenza
│   ├── join/
│   │   └── [code]/page.tsx     ← Landing link invito (/join/AB3F9C2D)
│   ├── layout.tsx
│   └── globals.css
├── components/
│   └── trip/
│       ├── CreateTripModal.tsx  ← Modal crea viaggio
│       ├── JoinTripModal.tsx    ← Modal join via codice
│       ├── LivePresence.tsx     ← Chi è online ora (Supabase Realtime)
│       └── InviteCode.tsx      ← Mostra/copia/condividi codice invito
├── lib/supabase/
│   ├── client.ts               ← Client browser
│   └── server.ts               ← Client server (RSC + Server Actions)
├── types/
│   └── database.ts             ← Tipi TypeScript
middleware.ts                   ← Protezione route + refresh sessione
supabase/migrations/
└── 001_module_a.sql            ← Schema DB completo
```

---

## Feature implementate nel Modulo A

- ✅ Registrazione email/password con auto-creazione profilo
- ✅ Login email/password
- ✅ Login con Google OAuth
- ✅ Reset password via email
- ✅ Middleware di protezione route
- ✅ Refresh automatico token sessione
- ✅ Creazione viaggio con nome, destinazione, date
- ✅ Join via codice di 8 caratteri
- ✅ Join via link diretto `/join/CODICE`
- ✅ Gestione ruoli (owner / editor / viewer)
- ✅ Presenza real-time (chi sta guardando il viaggio ora)
- ✅ Copia/condivisione codice invito (Web Share API + fallback)
- ✅ Row Level Security su tutti i dati
- ✅ Trigger automatici per profili e membership

---

## Prossimo: Modulo B — Itinerario e Tappe
Il Modulo B aggiungerà:
- Schema DB per tappe (days) e attività (activities)
- Timeline verticale interattiva
- Aggiunta/modifica/riordino tappe e attività
- Sincronizzazione real-time delle modifiche
