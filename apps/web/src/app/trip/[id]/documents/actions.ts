'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { TripDocument, DocType } from '@repo/shared/types/database'

export async function getDocuments(tripId: string): Promise<TripDocument[]> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from('trip_documents')
    .select('*')
    .eq('trip_id', tripId)
    .order('doc_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })

  return (data ?? []) as TripDocument[]
}

export async function addDocument(
  tripId: string,
  fields: {
    doc_type:     DocType
    title:        string
    booking_code?: string | null
    doc_date?:    string | null
    doc_time?:    string | null
    link_url?:    string | null
    notes?:       string | null
    day_id?:      string | null
  },
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  const { data: mem } = await supabase
    .from('trip_members').select('id').eq('trip_id', tripId).eq('user_id', user.id).single()
  if (!mem) return { error: 'Accesso negato' }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).from('trip_documents').insert({
    trip_id:      tripId,
    created_by:   user.id,
    doc_type:     fields.doc_type,
    title:        fields.title.trim(),
    booking_code: fields.booking_code?.trim() || null,
    doc_date:     fields.doc_date || null,
    doc_time:     fields.doc_time || null,
    link_url:     fields.link_url?.trim() || null,
    notes:        fields.notes?.trim() || null,
    day_id:       fields.day_id || null,
  })

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return {}
}

export async function deleteDocument(
  tripId: string,
  docId:  string,
): Promise<{ error?: string }> {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }

  // RLS: solo il creatore può eliminare
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('trip_documents')
    .delete()
    .eq('id', docId)
    .eq('trip_id', tripId)

  if (error) return { error: error.message }
  revalidatePath(`/trip/${tripId}`)
  return {}
}
