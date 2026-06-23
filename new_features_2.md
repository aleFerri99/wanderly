# Specifica di Progetto: Moduli Avanzati (V3) - Meteo, Gamification & Agentic AI

## 1. Modulo I: Previsioni Meteo e Ottimizzazione Itinerario
- [ ] **Trigger Automatico (Cron Job):** Eseguire un controllo automatico giornaliero alle ore 12:00, a partire da 2 giorni prima dell'inizio di ciascuna attività.
- [ ] **Integrazione API Meteo:** Recuperare le previsioni meteo in tempo reale per la località della tappa non appena disponibili.
- [ ] **Motore di Riorganizzazione:** Se il meteo è avverso, il sistema deve calcolare e suggerire una modifica ottimale all'itinerario (es. inversione di orari o spostamento di attività all'aperto/al chiuso).
- [ ] **Sistema di Notifica:** Inviare una notifica push o in-app agli utenti del gruppo per proporre la combinazione migliore calcolata.

---

## 2. Modulo J: Sistema di Gamification (Classifica Viaggiatori)
- [ ] **Data Model dei Punteggi:** Associare un punteggio dinamico a ogni viaggiatore specifico per quel singolo viaggio, con proclamazione del vincitore alla fine del viaggio.
- [ ] **Logica di Accumulo Punti (Estensibile per il futuro):**[cite: 3]
  * Attività completata: `+1 punto`[cite: 3].
  * Recensione (Solo punteggio numerico): `+1 punto`[cite: 3].
  * Recensione (Solo commento testuale): `+1 punto`[cite: 3].
  * Recensione completa (Voto + Testo): `+2 punti`[cite: 3].
- [ ] **Sondaggio Giornaliero di Fine Giornata:**[cite: 3]
  * Mostrare un pop-up/sondaggio obbligatorio a fine giornata per votare il "miglior viaggiatore del giorno"[cite: 3].
  * Chi non esprime il voto riceve una penalità di `-2 punti`[cite: 3].
  * Il viaggiatore più votato del giorno riceve un bonus di `+2 punti`[cite: 3].

---

## 3. Modulo K: Architettura Agentic AI (Multi-Agente)
Implementare un sistema a tre agenti intelligenti specializzati che collaborano tra loro:
- [ ] **Agente 1: Lo Psicologo:** Analizza i dettagli anagrafici, le passioni selezionate e lo storico dell'utente per tracciare un "Profilo Viaggiatore" personalizzato[cite: 3].
- [ ] **Agente 2: Il Meteorologo:** Monitora e interpreta l'evoluzione del tempo atmosferico nelle varie tappe dell'itinerario[cite: 3].
- [ ] **Agente 3: Il Travel Planner (Orchestratore):** Incrocia i dati del Profilo Viaggiatore (dallo Psicologo) e le condizioni climatiche (dal Meteorologo) per generare raccomandazioni intelligenti su nuove attività da fare[cite: 3].
- [ ] **UI/UX e Reattività Real-time:**[cite: 3]
  * Mostrare i suggerimenti generati in una nuova schermata dedicata, permettendo all'utente di selezionarli e aggiungerli al programma con un clic[cite: 3].
  * Rigenerare e aggiornare automaticamente i suggerimenti ogni volta che: l'itinerario cambia, il profilo di un utente viene modificato o cambiano le previsioni meteo[cite: 3].