# Specifica di Progetto: App Web Mobile - Collaborative Travel Planner

## 1. Panoramica del Progetto
* **Obiettivo:** Creare una Web App ottimizzata per dispositivi mobili (Mobile-First) che permetta a gruppi di viaggiatori di pianificare e gestire viaggi insieme in tempo reale.
* **Core Business:** Collaborazione multi-utente, gestione tappe/attività e tracciamento dell'avanzamento del viaggio.

## 2. Architettura e Stack Suggerito (Ideale per Vibe Coding)
* **Approccio:** Mobile-first, design interattivo e reattivo.
* **Sincronizzazione:** Sistema multi-utente in tempo reale (es. Supabase o Firebase) per fare in modo che ogni modifica di un utente sia visibile istantaneamente agli altri.

---

## 3. Moduli Funzionali

### Modulo A: Autenticazione e Gestione Gruppo (Multi-Utente)
- [ ] **Accesso/Registrazione:** Creazione account e login.
- [ ] **Insegui il Gruppo:** Possibilità di creare un "Viaggio" e invitare altri utenti tramite link o codice univoco.
- [ ] **Sincronizzazione Live:** UI reattiva che mostra aggiornamenti in tempo reale quando un altro membro modifica il viaggio.

### Modulo B: Gestione Viaggio e Itinerario
- [ ] **Creazione Viaggio:** Pagina principale del viaggio con dettagli generali (Nome, date, copertina, destinazione).
- [ ] **Struttura a Tappe:** Possibilità di aggiungere macro-tappe (es. Giorno 1: Parigi, Giorno 2: Versailles).
- [ ] **Sotto-Attività:** Per ogni tappa, possibilità di aggiungere N attività (es. Ore 10:00 Visita al Louvre, Ore 13:00 Pranzo). Ogni attività ha dettagli, orari e note.

### Modulo C: Timeline Interattiva e Avanzamento
- [ ] **Timeline Dinamica:** Una visualizzazione a flusso (Timeline) verticale o orizzontale ottimizzata per smartphone.
- [ ] **Stato di Avanzamento:** Checkbox o switch per segnare un'attività come "Completata".
- [ ] **Progress Bar / Gamification:** La timeline si colora o avanza visivamente man mano che il gruppo completa le attività della giornata.

### Modulo D: Feature Extra Consigliate (Aggiunte per l'Esperienza Utente)
- [ ] **Sistema di Votazione Attività:** Prima di confermare un'attività, i membri possono votare con un "Poll" (Favorevole/Contrario) direttamente nella scheda dell'attività.
- [ ] **Bacheca Spese Condivise (Mini-Splitwise):** Un pannello rapido per inserire chi ha pagato cosa e calcolare i saldi alla fine del viaggio.
- [ ] **Mappa della Tappa:** Integrazione con una mappa leggera (es. Leaflet o Google Maps statiche) per visualizzare i punti di interesse della giornata.
- [ ] **Sezione Documenti/Note Condivise:** Un'area dove caricare al volo PDF di biglietti o note importanti visibili a tutti.