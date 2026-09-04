import type { HealthProvider } from '@game/types.ts'
import { appUrl, callFunction } from './supabase'

/**
 * Flux OAuth côté navigateur, en PKCE.
 *
 * Le front n'obtient qu'un *code d'autorisation* : c'est l'Edge Function
 * `oauth-exchange` qui l'échange contre des jetons, avec le client secret que
 * le navigateur ne voit jamais.
 */

const CALLBACK_PATH = '/auth/health-callback'
const VERIFIER_PREFIX = 'gq.pkce.'

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
]

const FITBIT_SCOPES = ['activity', 'heartrate', 'sleep', 'profile']

export const PROVIDER_LABELS: Record<HealthProvider, string> = {
  google_fit: 'Google Fit',
  fitbit: 'Fitbit',
}

/** URI de redirection, identique pour les deux providers. */
export function redirectUri(): string {
  return `${appUrl()}${CALLBACK_PATH}`
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  return base64UrlEncode(bytes).slice(0, length)
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64UrlEncode(new Uint8Array(digest))
}

/** Vérifie que le Client ID du provider est bien configuré. */
export function isConfigured(provider: HealthProvider): boolean {
  return Boolean(clientIdFor(provider))
}

function clientIdFor(provider: HealthProvider): string | undefined {
  return provider === 'google_fit'
    ? import.meta.env.VITE_GOOGLE_CLIENT_ID
    : import.meta.env.VITE_FITBIT_CLIENT_ID
}

/**
 * Démarre la connexion à un provider : on part sur son écran de consentement.
 * Le `state` porte le provider, ce qui permet d'avoir une seule URL de
 * callback à déclarer des deux côtés.
 */
export async function startAuthorization(provider: HealthProvider): Promise<void> {
  const clientId = clientIdFor(provider)
  if (!clientId) {
    throw new Error(
      `Client ID manquant pour ${PROVIDER_LABELS[provider]}. Renseigne-le dans le fichier .env.`,
    )
  }

  const verifier = randomString(64)
  const challenge = await challengeFor(verifier)
  const nonce = randomString(16)
  const state = `${provider}:${nonce}`

  // sessionStorage : le verifier ne doit vivre que le temps de l'aller-retour.
  sessionStorage.setItem(`${VERIFIER_PREFIX}${state}`, verifier)

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })

  let authorizeUrl: string
  if (provider === 'google_fit') {
    params.set('scope', GOOGLE_SCOPES.join(' '))
    // `offline` + `consent` : sans ça Google ne redonne pas de refresh token
    // lors des reconnexions, et la synchro automatique s'arrête au bout d'une heure.
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
    params.set('include_granted_scopes', 'true')
    authorizeUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`
  } else {
    params.set('scope', FITBIT_SCOPES.join(' '))
    authorizeUrl = `https://www.fitbit.com/oauth2/authorize?${params}`
  }

  window.location.assign(authorizeUrl)
}

/** Termine le flux : échange le code via l'Edge Function. */
export async function completeAuthorization(
  code: string,
  state: string,
): Promise<{ provider: HealthProvider; warning: string | null }> {
  const storageKey = `${VERIFIER_PREFIX}${state}`
  const verifier = sessionStorage.getItem(storageKey)
  if (!verifier) {
    throw new Error(
      "Session d'autorisation introuvable ou expirée. Relance la connexion depuis les réglages.",
    )
  }
  sessionStorage.removeItem(storageKey)

  const provider = state.split(':')[0] as HealthProvider
  if (provider !== 'google_fit' && provider !== 'fitbit') {
    throw new Error('Provider inconnu dans la réponse OAuth.')
  }

  const result = await callFunction<{ warning: string | null }>('oauth-exchange', {
    provider,
    code,
    codeVerifier: verifier,
    redirectUri: redirectUri(),
  })

  return { provider, warning: result.warning ?? null }
}
