import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { ImportWizard } from './ImportWizard'
import './import.css'

export default async function ImportPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  return (
    <div className="import-page">
      <header className="import-header">
        <Link href="/dashboard" className="import-back">← Dashboard</Link>
        <span className="import-header-title">Importa itinerario</span>
        <div style={{ width: 60 }} />
      </header>
      <main className="import-main">
        <ImportWizard />
      </main>
    </div>
  )
}
