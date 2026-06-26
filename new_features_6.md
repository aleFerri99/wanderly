# Specifica di Progetto: Modulo Gamification, Classifica e Badge (Material 3)
* **Vincolo di Memoria:** Vietato l'uso di file multimediali (immagini, foto, blob). Tutti i giochi devono basarsi esclusivamente su stringhe di testo, numeri (ID) e coordinate/orari per non appesantire il DB locale.

## 1. Linee Guida di Memoria e UI
* **Massima Leggerezza:** I Badge NON devono utilizzare file di immagini (PNG/JPG). Saranno renderizzati esclusivamente tramite combinazioni di colori del tema Material 3, forme geometriche CSS e icone di sistema (es. Material Icons).
* **Stile:** Material Design 3 (Playful & Vibrant), con micro-interazioni fluide al tocco.

---

## 2. Check-list Funzionale dell'Interfaccia "Classifica"

### Sotto-modulo J.1: Integrazione dei Badge nella Classifica (Nuovo)
- [ ] **Bacheca dei Badge Utente:** Sotto il nome di ciascun viaggiatore nella classifica, mostrare una riga di icone compatte (i Badge sbloccati da quell'utente in quel viaggio). Un tap prolungato sull'icona apre un tooltip/popover che spiega il nome e il significato del badge.
- [ ] **Tab "Tutti i Badge" (Vetrina):** Inserire uno switch o una Tab secondaria nella schermata della Classifica chiamata "Vetrina Badge". Questa sezione mostra l'elenco completo dei badge disponibili nell'app (sia quelli sbloccati che quelli ancora grigi/bloccati), fungendo da incentivo per gli utenti.

### Sotto-modulo J.2: Logica di Assegnazione Badge (Data Model)
Il sistema sblocca i badge basandosi su controlli automatici (senza occupare spazio extra sul DB, solo leggendo i record esistenti):
- [ ] **Badge "Critico Severo":** Recensione di almeno 100 caratteri con voto inferiore a 4. Icona: `rate_review` o `gavel`.
- [ ] **Badge "Forchetta d'Oro":** Almeno 3 recensioni complete in attività taggate "Ristorazione". Icona: `restaurant`.
- [ ] **Badge "Intasatore di bagni":** Si da alla fine del viaggio se si è andati in bagno più di una volta al giorno. Icona `bathroom`.
- [ ] **Badge "MVP del viaggio":** Si da alla fine del viaggio a chi ha vinto più MVP giornalieri. Icona `champions cup`.

### Sotto-modulo J.3: Minigioco - "Trivia del Luogo" (AI Quiz)
- [ ] **Trigger di Attivazione:** Attivabile manualmente dagli utenti (es. "Siamo in treno/aeroporto, giochiamo!").
- [ ] **Generazione Quiz (Agente Travel Planner):** L'agente AI genera istantaneamente un mini-quiz di 5 domande a risposta multipla sulla storia, curiosità o cibo della destinazione attuale o successiva.
- [ ] **Sessione di Gioco Real-time:** I viaggiatori rispondono dal proprio smartphone. Il sistema calcola il punteggio combinando le risposte esatte e il tempo di risposta in secondi.
- [ ] **Assegnazione Punti:** Chi vince la sessione di Trivia ottiene il titolo giornaliero di **"Cervellone del Viaggio" (+15 punti nella classifica generale)**.