/**
 * Client Fitbit (Web API).
 *
 * Contrairement à Google Fit, Fitbit expose directement les minutes par zone
 * cardiaque — pas besoin de les recalculer. On utilise les endpoints "time
 * series" pour couvrir toute la plage en 6 requêtes, quel que soit le nombre
 * de jours : les apps "Personal" sont limitées à 150 requêtes/heure.
 */
import type { DailyActivity } from '../../../shared/game/types.ts'
import { emptyActivity } from './activity.ts'
import type { OAuthTokens } from './google-fit.ts'

const TOKEN_URL = 'https://api.fitbit.com/oauth2/token'
const API_BASE = 'https://api.fitbit.com'

export const FITBIT_SCOPES = ['activity', 'heartrate', 'sleep', 'profile']

interface FitbitTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  user_id?: string
  errors?: { message?: string }[]
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get('FITBIT_CLIENT_ID')
  const clientSecret = Deno.env.get('FITBIT_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('FITBIT_CLIENT_ID / FITBIT_CLIENT_SECRET manquants côté Edge Functions')
  }
  return { clientId, clientSecret }
}

function basicAuthHeader(): string {
  const { clientId, clientSecret } = credentials()
  return `Basic ${btoa(`${clientId}:${clientSecret}`)}`
}

function toTokens(payload: FitbitTokenResponse, fallbackRefresh?: string | null): OAuthTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? fallbackRefresh ?? null,
    expiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null,
    providerUserId: payload.user_id ?? null,
    scopes: payload.scope ?? null,
  }
}

/** Échange le code d'autorisation contre des jetons (flux PKCE). */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<OAuthTokens> {
  const { clientId } = credentials()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })

  const payload = (await response.json()) as FitbitTokenResponse
  if (!response.ok || !payload.access_token) {
    const message = payload.errors?.[0]?.message ?? `HTTP ${response.status}`
    throw new Error(`Fitbit: échange du code impossible (${message})`)
  }

  return toTokens(payload)
}

/**
 * Rafraîchit les jetons.
 *
 * Attention : Fitbit fait tourner le refresh token à chaque appel. L'ancien
 * est invalidé, il FAUT donc persister celui qui revient.
 */
export async function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const payload = (await response.json()) as FitbitTokenResponse
  if (!response.ok || !payload.access_token) {
    const message = payload.errors?.[0]?.message ?? `HTTP ${response.status}`
    throw new Error(
      `Fitbit: rafraîchissement impossible (${message}). ` +
        "L'utilisateur doit probablement reconnecter son compte.",
    )
  }

  return toTokens(payload, refreshToken)
}

// ---------------------------------------------------------------------------
// Lecture des données
// ---------------------------------------------------------------------------

async function apiGet<T>(accessToken: string, path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Accept-Language': 'en_US', // force les unités métriques côté distances
    },
  })

  if (response.status === 429) {
    throw new Error('Fitbit: quota horaire dépassé (150 req/h). Réessaie dans une heure.')
  }
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Fitbit: ${path} a répondu ${response.status} ${detail.slice(0, 200)}`)
  }

  return (await response.json()) as T
}

interface TimeSeriesEntry {
  dateTime: string
  value: string
}

/** Lit une série temporelle simple (`activities/<resource>`). */
async function timeSeries(
  accessToken: string,
  resource: string,
  from: string,
  to: string,
  key: string,
): Promise<Map<string, number>> {
  const payload = await apiGet<Record<string, TimeSeriesEntry[]>>(
    accessToken,
    `/1/user/-/activities/${resource}/date/${from}/${to}.json`,
  )
  const entries = payload[key] ?? []
  return new Map(entries.map((entry) => [entry.dateTime, Number(entry.value) || 0]))
}

interface HeartEntry {
  dateTime: string
  value?: {
    restingHeartRate?: number
    heartRateZones?: { name?: string; minutes?: number }[]
  }
}

interface SleepEntry {
  dateOfSleep?: string
  minutesAsleep?: number
  isMainSleep?: boolean
}

/** Récupère l'activité quotidienne Fitbit sur une plage de dates. */
export async function fetchActivity(accessToken: string, dates: string[]): Promise<DailyActivity[]> {
  if (dates.length === 0) return []

  const from = dates[0]
  const to = dates[dates.length - 1]

  const [steps, fairlyActive, veryActive, calories] = await Promise.all([
    timeSeries(accessToken, 'steps', from, to, 'activities-steps'),
    timeSeries(accessToken, 'minutesFairlyActive', from, to, 'activities-minutesFairlyActive'),
    timeSeries(accessToken, 'minutesVeryActive', from, to, 'activities-minutesVeryActive'),
    timeSeries(accessToken, 'calories', from, to, 'activities-calories'),
  ])

  // Zones cardiaques : Fitbit les fournit toutes faites, une entrée par jour.
  const heartByDate = new Map<string, HeartEntry>()
  try {
    const payload = await apiGet<{ 'activities-heart'?: HeartEntry[] }>(
      accessToken,
      `/1/user/-/activities/heart/date/${from}/${to}.json`,
    )
    for (const entry of payload['activities-heart'] ?? []) {
      heartByDate.set(entry.dateTime, entry)
    }
  } catch {
    // Pas de données cardiaques (bracelet sans capteur, scope refusé) : le
    // reste de la synchronisation doit quand même aboutir.
  }

  // Sommeil : facultatif, on ne bloque pas la synchro s'il manque.
  const sleepByDate = new Map<string, number>()
  try {
    const payload = await apiGet<{ sleep?: SleepEntry[] }>(
      accessToken,
      `/1.2/user/-/sleep/date/${from}/${to}.json`,
    )
    for (const entry of payload.sleep ?? []) {
      if (!entry.dateOfSleep) continue
      const previous = sleepByDate.get(entry.dateOfSleep) ?? 0
      sleepByDate.set(entry.dateOfSleep, previous + (entry.minutesAsleep ?? 0))
    }
  } catch {
    // idem
  }

  return dates.map((date) => {
    const activity = emptyActivity(date)
    activity.steps = steps.get(date) ?? 0
    activity.activeMinutes = (fairlyActive.get(date) ?? 0) + (veryActive.get(date) ?? 0)
    activity.calories = calories.get(date) ?? 0
    activity.sleepMinutes = sleepByDate.get(date) ?? 0

    const heart = heartByDate.get(date)
    for (const zone of heart?.value?.heartRateZones ?? []) {
      const minutes = Math.max(0, Math.round(zone.minutes ?? 0))
      switch (zone.name) {
        case 'Fat Burn':
          activity.fatBurnMinutes = minutes
          break
        case 'Cardio':
          activity.cardioMinutes = minutes
          break
        case 'Peak':
          activity.peakMinutes = minutes
          break
        default:
          // "Out of Range" : ne compte pas comme charge cardiaque.
          break
      }
    }
    activity.restingHeartRate = Math.round(heart?.value?.restingHeartRate ?? 0)

    return activity
  })
}
