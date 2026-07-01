// ============================================================
// packing.ts — Seeding della packing list personale (Modulo P)
// La lista AI viene generata UNA volta per viaggio e salvata in
// trips.packing_template; ogni viaggiatore ne riceve una copia
// personale come voci 'packing' nella bacheca (group_board).
// Usa service role: scrive per conto di qualsiasi utente, bypassa RLS.
// ============================================================

import { getServiceClient } from './gamification-server'
import { runPackingAgent } from './agents'

export async function seedPackingForUser(tripId: string, userId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = getServiceClient() as any

  // Idempotenza: salta se questo utente ha già la sua valigia per il viaggio
  const { count: existing } = await svc
    .from('group_board')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .eq('created_by', userId)
    .eq('content_type', 'packing')
  if ((existing ?? 0) > 0) return

  // Carica il viaggio (template + dati per generarlo)
  const { data: tripRaw } = await svc
    .from('trips')
    .select('destination, start_date, end_date, packing_template')
    .eq('id', tripId)
    .single()

  const trip = tripRaw as {
    destination: string | null; start_date: string | null
    end_date: string | null; packing_template: string[] | null
  } | null
  if (!trip) return

  // Template già pronto? clona. Altrimenti generalo con l'AI e salvalo.
  let template = trip.packing_template
  if (!template || template.length === 0) {
    template = await runPackingAgent(trip.destination ?? '', trip.start_date, trip.end_date)
    await svc.from('trips').update({ packing_template: template }).eq('id', tripId)
  }

  // Inserisce le voci personali nella bacheca
  const rows = template.map(text => ({
    trip_id:      tripId,
    created_by:   userId,
    content_type: 'packing',
    text_content: text,
  }))
  if (rows.length > 0) {
    await svc.from('group_board').insert(rows)
  }
}
