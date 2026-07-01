// queries/documents.ts — CLIENT-SAFE. CRUD documenti via RLS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any
import type { TripDocument, DocType } from '../../types/database'

export async function getDocuments(supabase: SupabaseLike, tripId: string): Promise<TripDocument[]> {
  const { data } = await supabase
    .from('trip_documents').select('*').eq('trip_id', tripId)
    .order('doc_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  return (data ?? []) as TripDocument[]
}

export async function addDocument(
  supabase: SupabaseLike,
  params: {
    tripId: string; docType: DocType; title: string
    bookingCode?: string | null; docDate?: string | null; docTime?: string | null
    linkUrl?: string | null; notes?: string | null
  },
): Promise<{ error?: string }> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Non autenticato' }
  const { error } = await supabase.from('trip_documents').insert({
    trip_id:      params.tripId,
    created_by:   user.id,
    doc_type:     params.docType,
    title:        params.title.trim(),
    booking_code: params.bookingCode?.trim() || null,
    doc_date:     params.docDate || null,
    doc_time:     params.docTime || null,
    link_url:     params.linkUrl?.trim() || null,
    notes:        params.notes?.trim() || null,
  })
  return { error: error?.message }
}

export async function deleteDocument(supabase: SupabaseLike, docId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('trip_documents').delete().eq('id', docId)
  return { error: error?.message }
}
