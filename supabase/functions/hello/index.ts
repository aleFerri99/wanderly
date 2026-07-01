// Edge Function "hello" — smoke test dell'infrastruttura.
// Verifica: (1) il JWT dell'utente arriva e viene validato,
//           (2) i segreti (GROQ/OpenTripMap) sono configurati.
// Invoca da client:  supabase.functions.invoke('hello')
import { corsHeaders, json } from '../_shared/cors.ts'
import { getUser } from '../_shared/client.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const user = await getUser(req)
    if (!user) return json({ error: 'Non autenticato' }, 401)

    return json({
      message:   'Ciao da Wanderly Edge! 👋 Infrastruttura attiva.',
      userId:    user.id,
      email:     user.email,
      secrets: {
        groq:        !!Deno.env.get('GROQ_API_KEY'),
        geoapify:    !!Deno.env.get('GEOAPIFY_KEY'),       // usato dall'enricher
        opentripmap: !!Deno.env.get('OPENTRIPMAP_API_KEY'), // opzionale (preferito ma con fallback su Geoapify)
      },
      ts: new Date().toISOString(),
    })
  } catch (e) {
    return json({ error: String(e instanceof Error ? e.message : e) }, 500)
  }
})
