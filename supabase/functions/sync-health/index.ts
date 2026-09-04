/**
 * Synchronisation à la demande : le joueur connecté récupère ses propres
 * données santé et voit ses contributions recalculées.
 *
 * L'app appelle cette fonction à l'ouverture, ce qui donne l'impression que
 * le jeu est « en direct » sans attendre le passage nocturne du cron.
 */
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { adminClient, getCallerId } from '../_shared/supabase.ts'
import { syncUser } from '../_shared/sync.ts'

/** Nombre de jours resynchronisés par défaut (rattrape les corrections tardives
 *  que les montres remontent parfois avec un jour de retard). */
const DEFAULT_DAYS = 7
const MAX_DAYS = 30

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'méthode non autorisée' }, 405)
  }

  const userId = await getCallerId(req)
  if (!userId) {
    return jsonResponse({ error: 'authentification requise' }, 401)
  }

  let days = DEFAULT_DAYS
  try {
    const body = (await req.json()) as { days?: number }
    if (typeof body.days === 'number' && Number.isFinite(body.days)) {
      days = Math.min(MAX_DAYS, Math.max(1, Math.round(body.days)))
    }
  } catch {
    // Corps absent ou invalide : on garde la valeur par défaut.
  }

  try {
    const result = await syncUser(adminClient(), userId, days)
    return jsonResponse(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erreur inconnue'
    console.error('sync-health:', message)
    return jsonResponse({ error: message }, 500)
  }
})
