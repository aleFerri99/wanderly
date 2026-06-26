# Specifica di Progetto: Modulo O - La Bacheca Note & Task Collaborativa
*REFACTORING:* Sostituire completamente il blocco di testo unico (`textarea`) mostrato in `image_3eb42a.png` con un sistema modulare a schede (Post-it style) in tempo reale.

## 1. Architettura dei Dati (Leggera e Testuale)
- [ ] **Tabella Database (`group_board`):** Ogni riga rappresenta un elemento inserito nella bacheca con i seguenti campi:
  * `id`, `travel_id`, `created_by` (ID utente).
  * `content_type`: ENUM ('nota', 'task').
  * `text_content`: Testo della nota o del task.
  * `is_completed`: Booleano (usato solo se `content_type` è 'task').
  * `completed_by`: ID utente che ha completato il task.
  * `timestamp`.

---

## 2. UI/UX in Chiave Material 3 (Mobile-First)
- [ ] **Filtro Rapido (Tabs):** In cima alla sezione, due piccole schede (*Filter Chips*) permettono di filtrare la vista: "Tutti", "Solo Note", "Solo Task da Fare".
- [ ] **Layout a Griglia/Flusso:** I messaggi compaiono come *Filled Cards* o *Outlined Cards* di Material 3. Ogni card mostra:
  * L'avatar circolare e il nome del creatore in piccolo in alto.
  * Il testo della nota o del task.
  * Un pulsante per eliminare il blocco (consentito solo al creatore).

---

## 3. Dinamiche Specifiche dei Blocchi

### I Post-it Informativi (`content_type: 'nota'`)
- [ ] Visualizzazione pulita del testo, ideale per link di prenotazione, codici WiFi o appunti logistici.

### I Task di Gruppo (`content_type: 'task'`)
- [ ] Accanto al testo compare una *Material Checkbox*.
- [ ] **Avanzamento Live:** Quando un viaggiatore spunta il task, la card diventa semi-trasparente, il testo viene sbarrato e compare la scritta *"Completato da [Nome Utente]"*.
- [ ] **Integrazione Gamification:** Chiunque completi un Task di gruppo guadagna all'istante **+5 punti** nella classifica generale del viaggio (da aggiungere alla tabella dei punteggi globali).