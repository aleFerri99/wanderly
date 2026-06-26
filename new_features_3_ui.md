# Specifica di Restyling Totale: Sistema Material Design 3 (M3)

## 1. Fondamenta del Design System (Applicate a TUTTA l'App)
- [ ] **Palette Colori M3 (Vibrant & Playful):** Impostare un tema centralizzato. Toni primari energici per i pulsanti e le azioni di gruppo (es. un viola profondo o blu elettrico), toni secondari caldi per i punteggi della gamification, e sfondi neutri e puliti (Surface) per non affaticare la vista.
- [ ] **Tipografia:** Token tipografici globali configurati con un font moderno, geometrico e fresco (es. *Plus Jakarta Sans* o *Outfit*).
- [ ] **Token di Forma (Shapes):** Smussatura degli angoli coerente e "friendly":
  * Card delle attività, dialoghi e pannelli: `Extra Large` (24px - 28px).
  * Pulsanti, tag delle passioni e campi di testo: `Full` (a pillola) o `Large` (16px).
- [ ] **Elevazione M3:** Abbandonare le ombreggiature pesanti. I livelli di priorità visiva si gestiscono tramite cambi di tonalità del colore della superficie (*Surface Tints*).

---

## 2. Layout Strutturale (Lo Scaffold Globale)
- [ ] **Bottom Navigation Bar:** Barra fissa in basso ottimizzata per il pollice su mobile, contenente 4 macro-aree:
  1. *Itinerario* (Timeline delle tappe e attività)
  2. *AI Hub* (I suggerimenti degli agenti e lo Smart Scheduling)
  3. *Classifica* (Punteggi e sondaggi di fine giornata)[cite: 3]
  4. *Profilo* (Area privata e passioni)[cite: 2]
- [ ] **Top App Bar Dinamica:** Mostra il titolo del viaggio condiviso e un pulsante rapido per l'export/condivisione dell'itinerario[cite: 2]. Si rimpicciolisce elegantemente durante lo scrolling.
- [ ] **Global Bottom Sheets:** Pannelli che scorrono dal basso per qualsiasi azione contestuale (inserimento attività rapida, voto nel sondaggio serale, filtri)[cite: 3].

---

## 3. Adeguamento delle Schermate della Web App (Migrazione a M3)

### Schermata A: Timeline Interattiva dell'Itinerario
- [ ] Trasformare la lista delle tappe e sotto-attività in un flusso verticale di *Elevated Cards* M3.
- [ ] **Stato di Avanzamento:** Le attività completate cambiano colore in modo fluido (es. passano a una tonalità pastello spenta) e mostrano una spunta verde animata.
- [ ] **Media dei Voti:** Accanto al titolo di ogni attività, mostrare un piccolo badge colorato e compatto con la media dei voti (1-10) degli utenti (senza più l'ombra dei vecchi Like)[cite: 2].
- [ ] **FAB (Floating Action Button):** Rimuovi il grande pulsante fluttuante a fondo pagina per aggiungere rapidamente una nuova attività o tappa "al volo".

### Schermata B: Profilo Utente e Registrazione (Ex Modulo E)
- [ ] **Form di Registrazione:** Layout pulito in stile Material (campi di testo con etichette fluttuanti)[cite: 2].
- [ ] **Tag delle Passioni:** La selezione delle passioni preimpostate deve usare i *Filter Chips* M3 (tag a pillola che cambiano colore in modo evidente quando vengono selezionati)[cite: 2].
- [ ] **Area Privata:** Inserire il badge "Utente registrato da X tempo" come una *Filled Card* stilizzata in cima al profilo[cite: 2].

### Schermata C: Gamification e Sondaggio Serale (Ex Modulo J)
- [ ] **Classifica Live:** Mostrare la lista dei viaggiatori con avatar circolari e *Linear Progress Indicators* (barre di progresso spesse e arrotondate) per mostrare visivamente i punti accumulati[cite: 3].
- [ ] **Il Sondaggio Quotidiano:** Gestito obbligatoriamente tramite un *Modal Bottom Sheet* che appare alle ore 09:00 a partire dal secondo giorno di viaggio (per votare il migliore della giornata precedente), impedendo altre azioni finché l'utente non esprime il voto per il "miglior viaggiatore"[cite: 3].

### Schermata D: AI Hub & Smart Scheduling (Ex Moduli H & K)
- [ ] **Le Schede degli Agenti:** Dare un'identità visiva ai 3 agenti (Psicologo, Meteorologo, Travel Planner) usando icone/avatar dedicati e sfondi con gradienti leggeri (Glow effects) per far capire che si tratta di una sezione "intelligente".
- [ ] **Suggerimenti dell'AI:** I consigli generati dagli agenti devono apparire come *Material Chips* cliccabili o card che l'utente può "esplorare" e aggiungere all'itinerario con uno swipe o un tap.