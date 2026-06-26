# Specifica di Progetto: Regolamento del Sistema di Punteggio (Gamification V2)

## 1. Tabella Rigida dei Punteggi (Core Logic)

| Evento / Azione | Punteggio | Tempistica / Trigger |
| :--- | :--- | :--- |
| **Inserimento Recensione Testuale** | `+10 punti` | Istantaneo (all'invio del testo) |
| **Inserimento Voto (1-10)** | `+10 punti` | Istantaneo (alla selezione del voto) |
| **Vincitore Sondaggio Giornaliero (MVP)** | `+50 punti` | Al voto di tutti o in automatico alle 22:00 |
| **Mancata Votazione al Sondaggio** | `-20 punti` | Automatico alle ore 22:00 |
| **Massimo Finanziatore (Fine Viaggio)** | `+50 punti` | Alla chiusura del viaggio (chi ha prestato più soldi) |
| **Massimo Debitore (Fine Viaggio)** | `-50 punti` | Alla chiusura del viaggio (chi ha più debiti) |
| **Clic su Pulsante "Bagno"** | `+10 punti` | Istantaneo (al clic sul pulsante nella classifica) |

*Nota combinazione:* Se un utente inserisce sia il voto che la recensione testuale per un'attività, guadagna un totale combinato di `+20 punti`.

---

## 2. Requisiti Logici e di Automazione

### Sotto-modulo J.4: Logica del Sondaggio MVP Giornaliero
- [ ] **Trigger di Chiusura Anticipata:** Se il 100% dei partecipanti esprime il proprio voto prima delle 22:00, il sondaggio si chiude all'istante e assegna subito `+50 punti` al vincitore.
- [ ] **Trigger di Chiusura Forzata (Ore 22:00):** Se alle 22:00 mancano ancora dei voti:
  * Il sistema applica automaticamente una penalità di `-20 punti` a tutti gli utenti che non hanno votato.
  * Il sistema calcola il vincitore in base ai voti ricevuti fino a quel momento e gli assegna i `+50 punti`. In caso di pareggio, il punto viene assegnato a pari merito o tramite coin-flip software.

### Sotto-modulo J.5: Integrazione Spese (Fine Viaggio)
- [ ] **Risoluzione Conti:** Al termine dell'ultima data del viaggio, il sistema analizza il bilancio della bacheca spese di gruppo:
  * Identifica l'utente con il saldo positivo più alto (chi ha anticipato più soldi) ed eroga `+50 punti`.
  * Identifica l'utente con il saldo negativo più basso (chi deve restituire più soldi) ed eroga `-50 punti`.

### Sotto-modulo J.6: UI Classifica e il "Pulsante Bagno"
- [ ] **Il Bottone Interattivo:** Nella schermata della Classifica, accanto all'avatar e al nome di ogni utente, deve essere presente un piccolo pulsante d'azione Material 3 (Icona: `wc` o `bathtub_outline`).
- [ ] **Click Fun:** Qualsiasi utente può cliccare il pulsante (o l'utente stesso per sé) per registrare una sessione bagno. Al clic, il sistema aggiunge immediatamente `+10 punti` al diario di quel viaggiatore e aggiorna la classifica in tempo reale con una micro-animazione.