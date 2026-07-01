// queries/board.ts — CLIENT-SAFE. Bacheca note/task + packing personale.
// Il completamento task usa la RPC complete_board_task (SECURITY DEFINER):
// assegna +5 punti ed elimina, identico su web e mobile.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { GroupBoardItem } from '../../types/database'

export async function getBoardItems(supabase: SupabaseLike, tripId: string): Promise<GroupBoardItem[]> {
  const { data } = await supabase
    .from('group_board')
    .select('*, creator:profiles!created_by(id, username, full_name, avatar_url)')
    .eq('trip_id', tripId)
    .order('created_at', { ascending: false })
  return (data ?? []) as GroupBoardItem[]
}

export async function addBoardItem(
  supabase: SupabaseLike, tripId: string, contentType: 'nota' | 'task', text: string,
): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('group_board').insert({
    trip_id: tripId, created_by: user.id, content_type: contentType, text_content: text.trim(),
  })
  return { error: error?.message }
}

export async function deleteBoardItem(supabase: SupabaseLike, itemId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('group_board').delete().eq('id', itemId)
  return { error: error?.message }
}

// Completa un task: RPC atomica → +5 punti + elimina (web e mobile identici).
export async function completeBoardTask(
  supabase: SupabaseLike, itemId: string,
): Promise<{ error?: string; alreadyDone?: boolean }> {
  const { data, error } = await supabase.rpc('complete_board_task', { p_item_id: itemId })
  if (error) return { error: error.message }
  if (data === false) return { alreadyDone: true }
  return {}
}

// Genera la valigia personale via Edge Function "packing" (Groq + service-role).
export async function generateMyPacking(
  supabase: SupabaseLike, tripId: string,
): Promise<{ created?: number; error?: string }> {
  // tripId nel body E come query param (fallback robusto se il body va perso)
  const { data, error } = await supabase.functions.invoke(
    `packing?tripId=${encodeURIComponent(tripId)}`, { body: { tripId } },
  )
  if (error) {
    let code: string | undefined
    try {
      const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context
      code = ctx?.json ? (await ctx.json())?.error : undefined
    } catch { /* body non-JSON */ }
    return { error: code ?? (error as { message?: string }).message }
  }
  if (data?.error) return { error: data.error }
  return { created: data?.created ?? 0 }
}

// Spunta una voce della propria valigia; quando sono tutte spuntate, elimina il blocco.
export async function togglePackingItem(
  supabase: SupabaseLike, tripId: string, itemId: string, completed: boolean,
): Promise<{ error?: string; allDone?: boolean }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { error } = await supabase
    .from('group_board')
    .update({ is_completed: completed, completed_by: completed ? user.id : null })
    .eq('id', itemId).eq('content_type', 'packing')
  if (error) return { error: error.message }

  const { count } = await supabase
    .from('group_board').select('*', { count: 'exact', head: true })
    .eq('trip_id', tripId).eq('created_by', user.id)
    .eq('content_type', 'packing').eq('is_completed', false)

  if ((count ?? 0) === 0) {
    await supabase.from('group_board').delete()
      .eq('trip_id', tripId).eq('created_by', user.id).eq('content_type', 'packing')
    return { allDone: true }
  }
  return {}
}
