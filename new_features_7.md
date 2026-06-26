# Specifica di Progetto: Regolamento del Sistema di Punteggio (Gamification V3)

## 1. Tabella Aggiornata dei Punteggi (Core Logic)

| Evento / Azione | Punteggio | Tempistica / Trigger | Note |
| :--- | :--- | :--- | :--- |
| **Inserimento Recensione Testuale** | `+10 punti` | Istantaneo | All'invio del testo della recensione |
| **Inserimento Voto (1-10)** | `+10 punti` | Istantaneo | Alla selezione del voto numerico |
| **Clic su Pulsante "Bagno"** | `+10 punti` | Istantaneo | Nessun limite di clic (cooldown di sicurezza) |
| **Proponente Attività Migliore di Ieri** | `+20 punti` | Automatico (Giorno dopo) | Calcolato sulla media dei voti dell'attività |
| **Proponente Attività Peggiore di Ieri** | `-20 punti` | Automatico (Giorno dopo) | Calcolato sulla media dei voti dell'attività |
| **Primo a Prepararsi la Mattina** | `+20 punti` | Istantaneo (1 volta al giorno) | Pulsante unico globale per il primo che lo preme |
| **Vincitore Sondaggio Giornaliero (MVP)** | `+50 punti` | Al voto di tutti o ore 22:00 | Assegnato a chi riceve più voti nel gruppo |
| **Mancata Votazione al Sondaggio** | `-20 punti` | Automatico ore 22:00 | Penalità per chi non esprime il voto MVP |
| **Inattività nella Pianificazione (2gg)** | `-30 punti` | Automatico (Controllo giornaliero) | Se l'utente non propone attività da 2 giorni |
| **Massimo Finanziatore (Fine Viaggio)** | `+50 punti` | Alla chiusura del viaggio | Chi ha anticipato più soldi nel gruppo |
| **Massimo Debitore (Fine Viaggio)** | `-50 punti` | Alla chiusura del viaggio | Chi deve restituire più soldi nel gruppo |

---

## 2. Nuove Logiche di Business e Automazioni

### Sotto-modulo J.7: Tracciamento Autore Attività
- [ ] **Modifica Database (`activities`):** Aggiungere un campo obbligatorio `proposed_by` (Foreign Key all'ID Utente) per registrare univocamente chi ha inserito l'attività nella tappa.

### Sotto-modulo J.8: Elaborazione Voti e Inattività (Task Giornaliero)
Eseguire un controllo automatico ogni giorno (es. alle ore 00:01 o insieme al controllo del meteo) per elaborare le seguenti regole:
- [ ] **Valutazione Attività del Giorno Prima:**
  * Il sistema isola tutte le attività svolte il giorno precedente.
  * Calcola la media matematica dei voti (1-10) ricevuti da ciascuna attività.
  * Identifica l'attività con la media più alta e assegna `+20 punti` all'utente presente in `proposed_by`.
  * Identifica l'attività con la media più bassa e assegna `-20 punti` all'utente presente in `proposed_by`.
- [ ] **Controllo Inattività (Malus -30):**
  * Il sistema verifica se l'utente ha inserito almeno un record nella tabella `activities` negli ultimi 2 giorni consecutivi.
  * Se l'utente non ha proposto alcuna attività nelle ultime 48 ore, applica automaticamente una penalità di `-30 punti`.

### Sotto-modulo J.9: UI Classifica e Gara Mattutina ("Più Veloce a Prepararsi")
- [ ] **Il Pulsante "Speedy" della Mattina:** Nella schermata della Classifica, accanto al pulsante "Bagno", aggiungere un nuovo pulsante Material 3 con l'icona di un fulmine (`bolt` o `speed`).
- [ ] **Logica di Concorrenza (Corsa a Tempo):**
  * Il pulsante si resetta e diventa attivo per tutti ogni mattina (es. alle ore 06:00).
  * Può essere premuto **una sola volta al giorno in totale all'interno di tutto il viaggio**.
  * Il primo viaggiatore del gruppo che clicca sul proprio pulsante si aggiudica il bonus di `+20 punti`.
  * Immediatamente dopo il primo clic andato a buon fine, il pulsante si disabilita e si blocca per tutti i membri del gruppo fino al mattino successivo, mostrando il nome di chi ha vinto la sfida quel giorno.