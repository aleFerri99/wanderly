## Stato attuale
- Un'app Next.js + Supabase standalone nella root del repo
- (analizza prima la struttura attuale e il gestore di pacchetti in uso)

## Obiettivo finale
my-monorepo/
├── apps/
│   └── web/                  ← l'app Next.js attuale, spostata qui
├── packages/
│   └── shared/               ← @repo/shared (token, types, supabase)
├── package.json              ← root workspace
├── pnpm-workspace.yaml
├── turbo.json
└── .npmrc

---

## Step 1 — Analisi e piano (non modificare nulla)

Riporta:
- Gestore di pacchetti attuale (npm/yarn/pnpm) e versione Node
- Struttura delle cartelle dell'app Next.js
- Dove vivono attualmente: client Supabase, types, query/mutation,
  utility condivisibili
- Eventuali path alias in tsconfig.json (es. "@/*")
- File di config che dovranno spostarsi con l'app (next.config,
  tailwind.config, postcss, ecc.)

Mostra il piano di spostamento file e aspetta conferma.

## Step 2 — Inizializza la struttura monorepo

1. Crea le cartelle apps/ e packages/.
2. Se il progetto non usa già pnpm, migra a pnpm:
   - rimuovi package-lock.json / yarn.lock
   - installa pnpm se necessario
3. Crea pnpm-workspace.yaml:
     packages:
       - "apps/*"
       - "packages/*"
4. Crea .npmrc nella root (CRITICO per la futura compatibilità Metro):
     node-linker=hoisted
     shamefully-hoist=true
5. Crea il package.json root del workspace:
     {
       "name": "my-monorepo",
       "private": true,
       "packageManager": "pnpm@<versione>",
       "scripts": {
         "dev": "turbo dev",
         "build": "turbo build",
         "lint": "turbo lint",
         "type-check": "turbo type-check"
       },
       "devDependencies": { "turbo": "latest" }
     }

## Step 3 — Sposta l'app Next.js in apps/web

1. Sposta tutto il codice dell'app (src/, app/, pages/, components/,
   public/, e i config: next.config, tailwind.config, postcss.config,
   tsconfig, ecc.) dentro apps/web/.
2. Mantieni il package.json dell'app dentro apps/web/ con il suo name
   (es. "web"). Lascia le sue dipendenze lì — NON spostarle nella root.
3. Aggiorna i path relativi nei config se necessario dopo lo spostamento.
4. Verifica che apps/web/tsconfig.json estenda un tsconfig base condiviso
   (vedi Step 5) ma mantenga i suoi path alias.

## Step 4 — Crea packages/shared (@repo/shared)

Crea packages/shared/ con questa struttura:
  packages/shared/
  ├── package.json
  ├── tsconfig.json
  ├── tokens/        (theme.ts già esistente va spostato qui se non lo è)
  ├── types/
  ├── supabase/
  └── index.ts

package.json di shared — punta ai SORGENTI .ts, niente build step:
  {
    "name": "@repo/shared",
    "version": "0.0.0",
    "private": true,
    "main": "./index.ts",
    "types": "./index.ts",
    "exports": {
      ".":          "./index.ts",
      "./tokens/*": "./tokens/*.ts",
      "./types/*":  "./types/*.ts",
      "./supabase/*": "./supabase/*.ts"
    }
  }

Importante: shared esporta TypeScript grezzo, NON pre-compilato. Saranno
le app (Next via transpilePackages, Metro via watchFolders) a transpilarlo.
Questo evita un build step intermedio.

## Step 5 — Sposta la logica condivisibile in shared

Analizza apps/web e SPOSTA in packages/shared tutto ciò che è
platform-agnostic (non usa next/*, window, document, DOM):
  - client Supabase di base → packages/shared/supabase/client.ts
    (la versione web; quella .native verrà dopo per il mobile)
  - types Supabase / dominio → packages/shared/types/
  - query e mutation pure → packages/shared/supabase/
  - utility pure, costanti, validazioni, schema

Per ogni file spostato:
  - aggiorna TUTTI gli import in apps/web che lo referenziavano,
    cambiandoli in import da '@repo/shared/...'
  - lascia in apps/web SOLO ciò che è web-specifico

NON spostare: componenti React DOM, hook che usano API browser/Next,
codice che dipende da next/navigation, next/headers, ecc.

## Step 6 — Configura Next.js per consumare shared

In apps/web/next.config.js aggiungi:
  transpilePackages: ['@repo/shared']
Aggiungi @repo/shared come dipendenza in apps/web/package.json:
  "dependencies": { "@repo/shared": "workspace:*" }

## Step 7 — tsconfig condiviso

Crea packages/tsconfig/base.json (o tsconfig.base.json nella root) con
le opzioni comuni (strict, target, moduleResolution: "Bundler", ecc.).
Fai estendere questo base sia da apps/web che da packages/shared.
Aggiungi i path alias per @repo/shared nel tsconfig base così l'editor
risolve i tipi.

## Step 8 — turbo.json

Crea turbo.json nella root:
  {
    "$schema": "https://turbo.build/schema.json",
    "tasks": {
      "build":      { "dependsOn": ["^build"],
                      "outputs": [".next/**", "!.next/cache/**", "dist/**"] },
      "dev":        { "cache": false, "persistent": true },
      "lint":       {},
      "type-check": { "dependsOn": ["^type-check"] }
    }
  }

## Step 9 — Verifica (deve passare tutto)

1. `pnpm install` dalla root completa senza errori
2. `pnpm dev` avvia l'app web correttamente
3. `pnpm build` builda l'app web senza errori
4. `pnpm type-check` passa: gli import da '@repo/shared' risolvono
   sia i valori che i tipi
5. L'app web funziona identica a prima: stesso comportamento, stesse
   query Supabase, stesso login (test manuale o descritto)
6. `git diff --stat` mostra solo spostamenti di file e aggiornamenti
   di import/config — nessuna modifica di logica

Riporta l'esito di ogni controllo.

---

## Vincoli assoluti
- Zero modifiche a logica, query Supabase, types, comportamento dell'app
- shared esporta sorgenti .ts grezzi, mai pre-compilati
- node-linker=hoisted nel .npmrc è obbligatorio (compatibilità Metro futura)
- Ogni import spostato va aggiornato — la build web deve restare verde
- Le dipendenze dell'app restano in apps/web/package.json, non nella root
  (eccetto turbo come devDependency root)