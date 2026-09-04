/**
 * Échange un code d'autorisation OAuth contre des jetons, puis les range en
 * base côté serveur.
 *
 * Le client secret ne quitte jamais cette fonction : le front n'obtient qu'un
 * code d'autorisation, qu'il transmet ici pour l'échange. Les jetons finaux ne
 * redescendent jamais au navigateur.
 */
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { adminClient, getCallerId } from '../_shared/supabase.ts'
import * as googleFit from '../_shared/google-fit.ts'
import * as fitbit from '../_shared/fitbit.ts'

interface ExchangeRequest {
  provider?: string
  code?: string
  codeVerifier?: string
  redirectUri?: string
}

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

  let body: ExchangeRequest
  try {
    body = (await req.json()) as ExchangeRequest
  } catch {
    return jsonResponse({ error: 'corps de requête invalide' }, 400)
  }

  const { provider, code, codeVerifier, redirectUri } = body
  if (!code || !codeVerifier || !redirectUri) {
    return jsonResponse({ error: 'code, codeVerifier et redirectUri sont requis' }, 400)
  }
  if (provider !== 'google_fit' && provider !== 'fitbit') {
    return jsonResponse({ error: 'provider inconnu' }, 400)
  }

  try {
    const tokens =
      provider === 'google_fit'
        ? await googleFit.exchangeCode(code, redirectUri, codeVerifier)
        : await fitbit.exchangeCode(code, redirectUri, codeVerifier)

    const supabase = adminClient()

    const { data: connection, error: connectionError } = await supabase
      .from('health_connections')
      .upsert(
        {
          user_id: userId,
          provider,
          provider_user_id: tokens.providerUserId,
          scopes: tokens.scopes,
          connected_at: new Date().toISOString(),
          last_sync_error: null,
        },
        { onConflict: 'user_id,provider' },
      )
      .select('id')
      .single()

    if (connectionError || !connection) {
      throw new Error(`enregistrement de la connexion impossible: ${connectionError?.message}`)
    }

    const { error: tokenError } = await supabase.from('health_tokens').upsert(
      {
        connection_id: connection.id,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_at: tokens.expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'connection_id' },
    )

    if (tokenError) {
      throw new Error(`enregistrement des jetons impossible: ${tokenError.message}`)
    }

    // Un refresh token absent signifie que Google n'en a pas redélivré : la
    // synchro automatique s'arrêtera à l'expiration de l'access token.
    const warning =
      provider === 'google_fit' && !tokens.refreshToken
        ? "Google n'a pas fourni de refresh token. Révoque l'accès dans ton compte Google puis reconnecte-toi pour activer la synchro automatique."
        : null

    return jsonResponse({ ok: true, provider, warning })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erreur inconnue'
    console.error('oauth-exchange:', message)
    return jsonResponse({ error: message }, 502)
  }
})
