import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

/**
 * Client "service role" : contourne la RLS. Il ne doit servir qu'aux écritures
 * de synchronisation et à la lecture des tokens OAuth, jamais à répondre
 * directement à une requête client sans vérification d'identité préalable.
 */
export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!url || !key) {
    throw new Error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis')
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/**
 * Identifie l'appelant à partir de son en-tête Authorization.
 * Renvoie null si le jeton est absent ou invalide.
 */
export async function getCallerId(req: Request): Promise<string | null> {
  const header = req.headers.get('Authorization')
  if (!header?.startsWith('Bearer ')) return null

  const token = header.slice('Bearer '.length)
  const { data, error } = await adminClient().auth.getUser(token)
  if (error || !data.user) return null

  return data.user.id
}
