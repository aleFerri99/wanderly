'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { awardPoints } from '@repo/shared/supabase/gamification'
import type { GroupBoardItem } from '@repo/shared/types/database'

type BoardItemType = 'nota' | 'task'

export async function getBoardItems(tripId: string): Promise<GroupBoardItem[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('group_board')
    .select(`
      *,
      creator:profiles!created_by(id, username, full_name, avatar_url),
      completer:profiles!completed_by(id, username, full_name)
    `)
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })

  return (data ?? []) as GroupBoardItem[]
}

export async function addBoardItem(
  tripId: string,
  contentType: BoardItemType,
  textContent: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('group_board').insert({
    trip_id: tripId, created_by: user.id,
    content_type: contentType, text_content: textContent.trim(),
  })

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return {}
}

export async function completeBoardTask(
  tripId: string,
  itemId: string,
): Promise<{ error?: string; alreadyDone?: boolean }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Assegna +5 punti prima di eliminare la riga (non-blocking)
  awardPoints(tripId, user.id, 'task_completed').catch(() => {})

  // Elimina la riga direttamente invece di aggiornarla:
  // - il Realtime riceve DELETE (più semplice da gestire nel client)
  // - nessun revalidatePath → non disturba il ciclo di vita del componente React
  // - guard .eq('is_completed', false): se qualcun altro ha già completato, la riga
  //   non esiste più e il DELETE non trova nulla → count = 0 → alreadyDone
  const { count } = await db
    .from('group_board')
    .delete({ count: 'exact' })
    .eq('id', itemId)
    .eq('trip_id', tripId)
    .eq('is_completed', false)
    .eq('content_type', 'task')

  if ((count ?? 0) === 0) return { alreadyDone: true }
  return {}
}

export async function deleteBoardItem(
  tripId: string,
  itemId: string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // RLS garantisce che solo il creatore può cancellare
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('group_board')
    .delete()
    .eq('id', itemId)
    .eq('trip_id', tripId)

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return {}
}

// ── Packing list personale (Modulo P) ─────────────────────────
// Spunta/despunta una voce della propria valigia.
// Quando TUTTE le voci sono spuntate, l'intera lista viene eliminata.
export async function togglePackingItem(
  tripId:    string,
  itemId:    string,
  completed: boolean,
): Promise<{ error?: string; allDone?: boolean }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const { error } = await db
    .from('group_board')
    .update({ is_completed: completed, completed_by: completed ? user.id : null })
    .eq('id', itemId)
    .eq('trip_id', tripId)
    .eq('content_type', 'packing')
  if (error) return { error: error.message }

  // Se non rimane nessuna voce da spuntare → elimina l'intera valigia
  const { count: remaining } = await db
    .from('group_board')
    .select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId)
    .eq('created_by', user.id)
    .eq('content_type', 'packing')
    .eq('is_completed', false)

  if ((remaining ?? 0) === 0) {
    await db.from('group_board')
      .delete()
      .eq('trip_id', tripId)
      .eq('created_by', user.id)
      .eq('content_type', 'packing')
    return { allDone: true }
  }

  return {}
}
