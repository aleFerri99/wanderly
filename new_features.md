# Specifica di Progetto: Moduli Aggiuntivi (V2) - Travel Planner

## 1. Modulo E: Gestione Utente e Profilo Avanzato
- [ ] **Registrazione (Tutti i campi obbligatori):**
  - Dati anagrafici: Nome/Username, Email, Password, Data di Nascita, Nazionalità, Sesso, Lingue parlate.
  - Interessi: Sezione "Passioni e preferenze di viaggio" basata esclusivamente su caselle di selezione (checkbox/tag) preimpostate.
- [ ] **Area Privata (Gestione Account):**
  - Visualizzazione del badge temporale (es. "Utente registrato da: X mesi/giorni").
  - Modifica dei campi anagrafici e delle passioni preimpostate.
  - Funzionalità di Cambio Password[cite: 2].
  - Pulsante per l'eliminazione definitiva dell'account (Delete Account)[cite: 2].
- [ ] **Autenticazione:**
  - Pulsante di Logout nell'area privata[cite: 2].
  - Form di Login con funzionalità integrata di "Reset Password"[cite: 2].

## 2. Modulo F: Sistema di Recensioni e Refactoring
- [ ] **REFACTORING CRITICO:** Rimuovere completamente la funzionalità dei "Like" attualmente implementata nell'applicazione[cite: 2].
- [ ] **Recensioni per Tappe e Attività:** Consentire a ogni utente di aggiungere una nota testuale (recensione) e un punteggio numerico da 1 a 10[cite: 2].
- [ ] **UI Recensioni:**
  - Nella schermata dell'attività, dividere e mostrare chiaramente le recensioni raggruppate per singolo utente[cite: 2].
  - Mostrare la media matematica dei voti (Average Score) direttamente accanto al titolo dell'attività[cite: 2].

## 3. Modulo G: Esportazione e Importazione Report Viaggio
- [ ] **Esportazione e Condivisione:** Funzione per scaricare e condividere l'intero itinerario con le relative attività[cite: 2].
- [ ] **Privacy ed Export dei Dati:** I dettagli esportati devono includere tutto il programma *tranne* le recensioni testuali dei singoli utenti. Deve essere inclusa solo la media dei voti[cite: 2].
- [ ] **Importazione Itinerario (Template):** Permettere ad altri utenti di importare il viaggio nel proprio account[cite: 2]. Al momento dell'importazione, il sistema deve obbligare l'utente a selezionare le nuove date per il viaggio, per ciascuna tappa e per ciascuna attività[cite: 2].

## 4. Modulo H: Algoritmo di Smart Scheduling (Ordinamento Attività)
- [ ] **Attività Senza Data:** Consentire all'utente di inserire un'attività in una tappa senza specificare un giorno o un orario preciso[cite: 2].
- [ ] **Motore di Raccomandazione Automatico:** Il sistema deve analizzare le attività non pianificate e inserire automaticamente nel programma il momento migliore (giorno e ora), basandosi su due macro-criteri[cite: 2]:
  1. *Fattori intrinseci dell'attività:* Orari meno affollati, disponibilità di sconti, momento ideale della giornata per la visita e durata stimata dell'attività[cite: 2].
  2. *Fattori logistici:* Distanza geografica dalle altre attività della tappa, applicando una clusterizzazione per raggruppare le attività vicine tra loro[cite: 2].