// Edge Function "packing" — porta seedPackingForUser (web) su Supabase.
// Genera (o clona dal template del viaggio) la packing list personale dell'utente
// corrente e la inserisce in group_board come voci 'packing'. Usa service-role
// per leggere/scrivere il template del viaggio (trips.packing_template).
// Body: { tripId: string }
import { corsHeaders, json } from '../_shared/cors.ts'
import { adminClient, getUser } from '../_shared/client.ts'
import { userClient } from '../_shared/client.ts'
import { runPackingAgent } from '../_shared/agents.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)

    // Parsing robusto del body + fallback su query param ?tripId=
    let tripId: string | undefined
    try {
      const raw = await req.text()
      if (raw) tripId = (JSON.parse(raw) as { tripId?: string }).tripId
    } catch { /* body non-JSON */ }
    if (!tripId) tripId = new URL(req.url).searchParams.get('tripId') ?? undefined
    if (!tripId) return json({ error: 'tripId mancante' }, 400)

    // Membership con il client dell'utente (RLS)
    const { data: mem } = await userClient(req)
      .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle()
    if (!mem) return json({ error: 'Accesso negato' }, 403)

    const svc = adminClient()

    // Idempotenza: l'utente ha già la sua valigia?
    const { count: existing } = await svc
      .from('group_board').select('*', { count: 'exact', head: true })
      .eq('trip_id', tripId).eq('created_by', user.id).eq('content_type', 'packing')
    if ((existing ?? 0) > 0) return json({ success: true, created: 0, already: true })

    const { data: tripRaw } = await svc
      .from('trips').select('destination, start_date, end_date, packing_template').eq('id', tripId).single()
    const trip = tripRaw as {
      destination: string | null; start_date: string | null
      end_date: string | null; packing_template: string[] | null
    } | null
    if (!trip) return json({ error: 'Viaggio non trovato' }, 404)

    // Template già pronto? clona. Altrimenti generalo e salvalo sul viaggio.
    let template = trip.packing_template
    if (!template || template.length === 0) {
      template = await runPackingAgent(trip.destination ?? '', trip.start_date, trip.end_date)
      await svc.from('trips').update({ packing_template: template }).eq('id', tripId)
    }

    const rows = template.map(text => ({
      trip_id: tripId, created_by: user.id, content_type: 'packing', text_content: text,
    }))
    if (rows.length > 0) await svc.from('group_board').insert(rows)

    return json({ success: true, created: rows.length })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
