// Client Supabase per React Native / Web.
// - react-native-url-polyfill: supabase-js usa URL/URLSearchParams (assenti in RN)
// - Storage per piattaforma: localStorage sul web, AsyncStorage su device
// - Singleton su globalThis: evita "Multiple GoTrueClient instances" con l'HMR
//   del dev server (client duplicati che si contendono/invalidano il token)
import 'react-native-url-polyfill/auto'
import { AppState, Platform } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@repo/shared/types/database'

const url  = process.env.EXPO_PUBLIC_SUPABASE_URL!
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!

const g = globalThis as unknown as { __wanderlySupabase?: SupabaseClient<Database> }

export const supabase: SupabaseClient<Database> =
  g.__wanderlySupabase ??
  createClient<Database>(url, anon, {
    auth: {
      // Sul web lascia lo storage di default (localStorage): AsyncStorage + navigator.locks
      // del web non vanno d'accordo e causano race sul token.
      storage: Platform.OS === 'web' ? undefined : AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  })

if (!g.__wanderlySupabase) {
  g.__wanderlySupabase = supabase
  // Auto-refresh del token pilotato da AppState (solo su device; sul web è no-op).
  if (Platform.OS !== 'web') {
    AppState.addEventListener('change', state => {
      if (state === 'active') supabase.auth.startAutoRefresh()
      else supabase.auth.stopAutoRefresh()
    })
  }
}
