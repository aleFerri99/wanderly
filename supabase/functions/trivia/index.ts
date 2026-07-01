// Edge Function "trivia" — porta la logica AI/privilegiata del quiz.
// Azioni (body.action):
//  - 'create'   { tripId, destination } → genera 5 domande (Groq) + crea sessione 'waiting'
//  - 'finalize' { sessionId, tripId, force? } → scoring + punti + badge (service-role)
// Le operazioni semplici (start, submit answer, read) restano client-direct via RLS.
import { corsHeaders, json } from '../_shared/cors.ts'
import { userClient, adminClient, getUser } from '../_shared/client.ts'
import { generateTriviaQuestions, checkAndFinalize, finalizeSession, startSession, tickSession } from '../_shared/trivia.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)

    const body = await req.json().catch(() => ({})) as {
      action?: string; tripId?: string; sessionId?: string; destination?: string; force?: boolean
    }
    const db = userClient(req)

    // ── CREATE ────────────────────────────────────────────────
    if (body.action === 'create') {
      const { tripId, destination } = body
      if (!tripId) return json({ error: 'tripId mancante' }, 400)

      const { data: mem } = await db
        .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).maybeSingle()
      if (!mem) return json({ error: 'Accesso negato' }, 403)

      const admin = adminClient()

      // Pulizia: sessioni active bloccate da >5min + sessioni finished (residui)
      const staleThreshold = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      await admin.from('trivia_sessions').delete()
        .eq('trip_id', tripId).eq('status', 'active').lt('started_at', staleThreshold)
      await admin.from('trivia_sessions').delete()
        .eq('trip_id', tripId).eq('status', 'finished')

      // Nessuna sessione in corso?
      const { data: existing } = await db
        .from('trivia_sessions').select('id, status').eq('trip_id', tripId)
        .in('status', ['waiting', 'active']).maybeSingle()
      if (existing) return json({ error: 'C\'è già una sessione in corso!', sessionId: existing.id }, 200)

      const questions = await generateTriviaQuestions(destination || 'Italia')

      const { data: session, error } = await db
        .from('trivia_sessions')
        .insert({ trip_id: tripId, created_by: user.id, destination: destination ?? '', questions, status: 'waiting' })
        .select('id').single()
      if (error) return json({ error: error.message }, 500)

      return json({ sessionId: session.id })
    }

    // ── START (avvio manuale del creatore) ───────────────────
    if (body.action === 'start') {
      const { sessionId, tripId } = body
      if (!sessionId || !tripId) return json({ error: 'sessionId/tripId mancanti' }, 400)
      const { data: sess } = await db
        .from('trivia_sessions').select('id, trip_id, created_by').eq('id', sessionId).maybeSingle()
      if (!sess || sess.trip_id !== tripId) return json({ error: 'Accesso negato' }, 403)
      if (sess.created_by !== user.id) return json({ error: 'Solo il creatore può avviare' }, 403)
      const r = await startSession(adminClient(), sessionId)
      return json(r)
    }

    // ── TICK (motore del gioco sincronizzato) ─────────────────
    if (body.action === 'tick') {
      const { sessionId, tripId } = body
      if (!sessionId || !tripId) return json({ error: 'sessionId/tripId mancanti' }, 400)
      const { data: sess } = await db
        .from('trivia_sessions').select('id, trip_id').eq('id', sessionId).maybeSingle()
      if (!sess || sess.trip_id !== tripId) return json({ error: 'Accesso negato' }, 403)
      const r = await tickSession(adminClient(), sessionId, tripId)
      return json(r)
    }

    // ── FINALIZE ──────────────────────────────────────────────
    if (body.action === 'finalize') {
      const { sessionId, tripId, force } = body
      if (!sessionId || !tripId) return json({ error: 'sessionId/tripId mancanti' }, 400)

      // Verifica membership tramite la sessione (RLS sulle select)
      const { data: sess } = await db
        .from('trivia_sessions').select('id, trip_id').eq('id', sessionId).maybeSingle()
      if (!sess || sess.trip_id !== tripId) return json({ error: 'Accesso negato' }, 403)

      const admin = adminClient()
      const result = force
        ? await finalizeSession(admin, sessionId, tripId)
        : await checkAndFinalize(admin, sessionId, tripId)
      return json(result)
    }

    return json({ error: 'Azione non valida' }, 400)
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
