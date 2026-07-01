// Edge Function "trip-end" — porta trip-end.ts + badge-checker.ts (service-role).
// Azioni:
//  'trip-end'  { tripId, tripEndDate } → bonus spese (±50) + badge fine viaggio
//  'on-review' { tripId }             → badge da recensione per l'utente chiamante
import { corsHeaders, json } from '../_shared/cors.ts'
import { userClient, adminClient, getUser } from '../_shared/client.ts'

const FOOD_KEYWORDS = [
  'ristoran', 'trattoria', 'osteria', 'pizzeria', 'pizza', 'cena', 'pranzo',
  'colazione', 'brunch', 'gelateria', 'pasticceria', 'bar ', 'café', 'caffè',
  'bakery', 'bistrot', 'food', 'sushi', 'ramen', 'burger', 'kebab', 'street food',
  'mercato', 'degustazione', 'dinner', 'lunch', 'breakfast', 'snack',
]
const MASSIMO_FINANZIATORE = 50
const MASSIMO_DEBITORE = -50

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any

async function awardBadge(db: DB, userId: string, tripId: string, badgeId: string) {
  await db.from('user_achievements').upsert(
    { user_id: userId, trip_id: tripId, badge_id: badgeId },
    { onConflict: 'user_id,trip_id,badge_id', ignoreDuplicates: true },
  )
}

async function applyExpenseBonuses(db: DB, tripId: string): Promise<void> {
  const { data: existing } = await db.from('points_log').select('id')
    .eq('trip_id', tripId).in('event_type', ['massimo_finanziatore', 'massimo_debitore']).limit(1).maybeSingle()
  if (existing) return

  const [{ data: expRaw }, { data: membRaw }] = await Promise.all([
    db.from('expenses').select('paid_by, amount_eur, split_among').eq('trip_id', tripId),
    db.from('trip_members').select('user_id').eq('trip_id', tripId),
  ])
  const expenses = (expRaw ?? []) as { paid_by: string; amount_eur: number; split_among: string[] }[]
  const memberIds = ((membRaw ?? []) as { user_id: string }[]).map(m => m.user_id)
  if (!expenses.length || memberIds.length < 2) return

  const bal = new Map<string, number>(memberIds.map(id => [id, 0]))
  for (const e of expenses) {
    const n = e.split_among.length; if (!n) continue
    const share = e.amount_eur / n
    bal.set(e.paid_by, (bal.get(e.paid_by) ?? 0) + e.amount_eur)
    for (const uid of e.split_among) bal.set(uid, (bal.get(uid) ?? 0) - share)
  }
  const entries = [...bal.entries()]
  const top = entries.reduce((a, b) => b[1] > a[1] ? b : a)
  if (top[1] > 0.01) await db.from('points_log').insert({ trip_id: tripId, user_id: top[0], event_type: 'massimo_finanziatore', points: MASSIMO_FINANZIATORE, metadata: { net_balance: Math.round(top[1] * 100) / 100 } })
  const low = entries.reduce((a, b) => b[1] < a[1] ? b : a)
  if (low[1] < -0.01) await db.from('points_log').insert({ trip_id: tripId, user_id: low[0], event_type: 'massimo_debitore', points: MASSIMO_DEBITORE, metadata: { net_balance: Math.round(low[1] * 100) / 100 } })
}

async function checkIntasatore(db: DB, userId: string, tripId: string) {
  const [{ count }, { data: tripRaw }] = await Promise.all([
    db.from('points_log').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('trip_id', tripId).eq('event_type', 'bathroom'),
    db.from('trips').select('start_date, end_date').eq('id', tripId).single(),
  ])
  const trip = tripRaw as { start_date: string | null; end_date: string | null } | null
  if (!trip?.start_date || !trip?.end_date) return
  const days = Math.max(1, Math.ceil((new Date(trip.end_date + 'T00:00:00').getTime() - new Date(trip.start_date + 'T00:00:00').getTime()) / 86400000) + 1)
  if ((count ?? 0) > days) await awardBadge(db, userId, tripId, 'intasatore_bagni')
}

async function checkMvpDelViaggio(db: DB, tripId: string) {
  const { data } = await db.from('points_log').select('user_id').eq('trip_id', tripId).in('event_type', ['mvp_winner', 'mvp_tie_winner'])
  const logs = (data ?? []) as { user_id: string }[]
  if (!logs.length) return
  const counts = new Map<string, number>()
  for (const l of logs) counts.set(l.user_id, (counts.get(l.user_id) ?? 0) + 1)
  const max = Math.max(...counts.values())
  for (const [uid, c] of counts.entries()) if (c === max) await awardBadge(db, uid, tripId, 'mvp_del_viaggio')
}

async function checkCriticoSevero(db: DB, userId: string, tripId: string) {
  const { data } = await db.from('reviews').select('content').eq('user_id', userId).eq('trip_id', tripId).lt('score', 4).not('content', 'is', null)
  if (((data ?? []) as { content: string }[]).some(r => (r.content?.length ?? 0) >= 100)) await awardBadge(db, userId, tripId, 'critico_severo')
}

async function checkForchetaDOro(db: DB, userId: string, tripId: string) {
  const { data } = await db.from('reviews')
    .select('activity_id, content, activity:activities!activity_id(title, location)')
    .eq('user_id', userId).eq('trip_id', tripId).not('activity_id', 'is', null).not('content', 'is', null)
  type R = { content: string | null; activity: { title: string | null; location: string | null } | null }
  const food = ((data ?? []) as R[]).filter(r => {
    if (!r.content || r.content.length < 5) return false
    const text = `${r.activity?.title ?? ''} ${r.activity?.location ?? ''}`.toLowerCase()
    return FOOD_KEYWORDS.some(kw => text.includes(kw))
  })
  if (food.length >= 3) await awardBadge(db, userId, tripId, 'forchetta_oro')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)
    const body = await req.json().catch(() => ({})) as { action?: string; tripId?: string; tripEndDate?: string | null }
    if (!body.tripId) return json({ error: 'tripId mancante' }, 400)

    // Membership (user-scoped)
    const { data: mem } = await userClient(req).from('trip_members').select('id').eq('trip_id', body.tripId).eq('user_id', user.id).maybeSingle()
    if (!mem) return json({ error: 'Accesso negato' }, 403)

    const admin = adminClient()

    if (body.action === 'on-review') {
      await Promise.all([checkCriticoSevero(admin, user.id, body.tripId), checkForchetaDOro(admin, user.id, body.tripId)])
      return json({ success: true })
    }

    // 'trip-end' (default): solo se il viaggio è finito
    const today = new Date().toISOString().split('T')[0]
    if (!body.tripEndDate || body.tripEndDate >= today) return json({ success: true, applied: false })

    await applyExpenseBonuses(admin, body.tripId)
    const { data: membRaw } = await admin.from('trip_members').select('user_id').eq('trip_id', body.tripId)
    const memberIds = ((membRaw ?? []) as { user_id: string }[]).map(m => m.user_id)
    await Promise.all([...memberIds.map(uid => checkIntasatore(admin, uid, body.tripId!)), checkMvpDelViaggio(admin, body.tripId)])
    return json({ success: true, applied: true })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
