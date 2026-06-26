# Specifica di Progetto: Modulo N - Il Passaporto del Viaggiatore

## 1. Panoramica della Feature
* **Posizione:** All'interno dell'Area Privata / Schermata Profilo Utente.
* **Obiettivo:** Offrire una dashboard visiva e interattiva ("Passaporto") che mostri la storia dei viaggi dell'utente attraverso un mappamondo e statistiche di sblocco globale.
* **Filosofia UI:** Material Design 3 (Playful & Lightweight). La mappa deve caricarsi istantaneamente su mobile senza pesare sulle prestazioni.

---

## 2. Requisiti e Check-list Funzionale

### Sotto-modulo N.1: Struttura Dati e Statistiche
- [ ] **Aggiornamento Database:** Creare una tabella di associazione (es. `user_visited_countries`) che colleghi l'ID utente ai codici univoci dei paesi visitati (usare lo standard ISO Alpha-2 o Alpha-3, es. "IT", "FR", "US").
- [ ] **Contatore di Progresso (Stats):** Calcolare e mostrare un indicatore numerico del tipo: `"Hai visitato X / 195 Paesi nel Mondo"` (utilizzando il numero standard dei paesi riconosciuti).

### Sotto-modulo N.2: Il Mappamondo Interattivo (Interfaccia Mobile)
- [ ] **Mappa Vettoriale Leggera:** Implementare un mappamondo interattivo ottimizzato per mobile (es. un SVG interattivo reattivo o una mappa geo-vettoriale ultraleggera). Evitare il caricamento di mappe pesanti a tasselli (stile Google Maps satellitare) per mantenere l'app scattante.
- [ ] **Stile Material 3:** I paesi non visitati devono avere un colore neutro (Surface/Outline del tema M3), mentre i paesi visitati devono essere chiaramente evidenziati con il colore Primary o Tertiary del tema.
- [ ] **Zoom & Pan Mobile:** Consentire all'utente di zoomare e spostare il mappamondo con le dita (pinch-to-zoom) in modo fluido.

### Sotto-modulo N.3: Flussi di Inserimento (Automatico e Manuale)
- [ ] **Trigger di Automazione:** Quando un viaggio di gruppo giunge al termine (la data di fine viaggio è passata), il sistema deve estrarre automaticamente lo stato di destinazione e aggiungerlo alla lista dei paesi visitati del passaporto di tutti i partecipanti.
- [ ] **Inserimento Manuale (Fallback):** Fornire un pulsante "Aggiungi Paese" che apre un *Bottom Sheet* Material 3. All'interno, una barra di ricerca con auto-completamento permette all'utente di selezionare e colorare manualmente un paese in cui è stato in passato (o rimuoverlo in caso di errore).