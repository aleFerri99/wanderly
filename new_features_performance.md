# Specifica di Refactoring: Performance, Memoria e Ottimizzazione Database

## 1. Obiettivo Generale
* **Scopo:** Eseguire un audit e un refactoring completo del codice per massimizzare la velocità di esecuzione e ridurre al minimo l'impronta di memoria sul database locale e sul dispositivo.
* **Vincolo Assoluto:** La logica di business, le funzionalità esistenti e i flussi utente **NON devono essere modificati**. È un intervento puramente strutturale e prestazionale.
* **Filosofia:** Applicazione "Lightweight" (leggera). Evitare il sovraccarico di dati in locale.

---

## 2. Direttive di Ottimizzazione

### Modulo L.1: Ottimizzazione Database & Memory Footprint
- [ ] **Query Pruning & Lazy Loading:** Rivedere tutte le query al DB. Assicurarsi che l'applicazione non carichi in memoria interi oggetti o tabelle correlate quando non sono strettamente necessari nella schermata attuale (es. non caricare tutte le recensioni testuali mentre si visualizza solo la lista delle tappe).
- [ ] **Indicizzazione Strategica:** Identificare i campi chiave più utilizzati nelle clausole `WHERE`, `JOIN` o di ordinamento (es. `travel_id`, `user_id`, `date`) e aggiungere gli opportuni indici sul database per velocizzare le letture.
- [ ] **Pulizia Dati Temporanei:** Ottimizzare la memorizzazione dei dati meteo o dei suggerimenti degli agenti AI. Configurare un sistema di sovrascrittura o una cache a tempo (TTL) per evitare che i vecchi dati meteo o i vecchi log occupino spazio inutilmente sul DB.

### Modulo L.2: Velocità di Esecuzione e Reattività UI
- [ ] **Memoizzazione e Caching in App:** Implementare meccanismi di caching temporaneo nello stato dell'applicazione per evitare query ripetitive al DB durante la navigazione tra le tab della stessa schermata.
- [ ] **Debouncing & Throttling sui Trigger Real-time:** Ottimizzare i listener in tempo reale (Supabase/Firebase o i calcoli degli Agenti AI). Assicurarsi che le modifiche ravvicinate non scatenino loop infiniti di aggiornamenti o ricalcoli, ma vengano raggruppate (batching).
- [ ] **Ottimizzazione del Rendering dei Grandi Elenchi:** Nelle schermate della timeline o dei suggerimenti, assicurarsi che la UI utilizzi liste ottimizzate (es. componenti virtualizzati o Lazy/RecyclerView) che renderizzano solo gli elementi visibili sullo schermo dello smartphone.