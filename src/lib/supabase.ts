import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error(
    'VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY sont manquants. Copie .env.example en .env et remplis-les.',
  )
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** URL publique de l'app, utilisée pour construire les redirect_uri OAuth. */
export function appUrl(): string {
  return import.meta.env.VITE_APP_URL || window.location.origin
}

/** Appelle une Edge Function en transmettant le jeton de l'utilisateur. */
export async function callFunction<T>(
  name: string,
  body: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body })
  if (error) {
    // Supabase enveloppe les erreurs HTTP ; on essaie d'en extraire le message
    // renvoyé par la fonction, bien plus parlant que « non-2xx status ».
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        const payload = (await context.json()) as { error?: string }
        if (payload.error) throw new Error(payload.error)
      } catch (parseError) {
        if (parseError instanceof Error && parseError.message !== error.message) throw parseError
      }
    }
    throw new Error(error.message)
  }
  return data as T
}
