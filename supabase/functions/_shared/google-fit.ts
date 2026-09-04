/**
 * Client Google Fit (Fitness REST API v1).
 *
 * Particularité importante : contrairement à Fitbit, Google Fit ne renvoie PAS
 * de minutes par zone cardiaque. On récupère donc la fréquence cardiaque brute
 * agrégée par tranches de 5 minutes et on classe chaque tranche nous-mêmes à
 * partir de la FC max du joueur.
 */
import type { DailyActivity } from '../../../shared/game/types.ts'
import { classifyHeartRateZones, emptyActivity, type ZoneMinutes } from './activity.ts'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const AGGREGATE_URL = 'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate'

const DAY_MS = 24 * 60 * 60 * 1000
const HR_BUCKET_MINUTES = 5

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/fitness.activity.read',
  'https://www.googleapis.com/auth/fitness.heart_rate.read',
]

export interface OAuthTokens {
  accessToken: string
  refreshToken: string | null
  expiresAt: string | null
  providerUserId: string | null
  scopes: string | null
}

interface GoogleTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  id_token?: string
  error?: string
  error_description?: string
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET manquants côté Edge Functions')
  }
  return { clientId, clientSecret }
}

/** Extrait le `sub` (identifiant Google stable) d'un id_token, sans vérifier
 *  la signature : il ne sert qu'à un affichage indicatif, jamais à autoriser. */
function subjectFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null
  try {
    const payload = idToken.split('.')[1]
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const decoded = JSON.parse(atob(padded)) as { sub?: string }
    return decoded.sub ?? null
  } catch {
    return null
  }
}

function toTokens(payload: GoogleTokenResponse, fallbackRefresh?: string | null): OAuthTokens {
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? fallbackRefresh ?? null,
    expiresAt: payload.expires_in
      ? new Date(Date.now() + payload.expires_in * 1000).toISOString()
      : null,
    providerUserId: subjectFromIdToken(payload.id_token),
    scopes: payload.scope ?? null,
  }
}

/** Échange le code d'autorisation contre des jetons (flux PKCE). */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<OAuthTokens> {
  const { clientId, clientSecret } = credentials()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    }),
  })

  const payload = (await response.json()) as GoogleTokenResponse
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google: échange du code impossible (${payload.error ?? response.status}: ${
        payload.error_description ?? 'erreur inconnue'
      })`,
    )
  }

  return toTokens(payload)
}

/** Rafraîchit un access token expiré. */
export async function refreshTokens(refreshToken: string): Promise<OAuthTokens> {
  const { clientId, clientSecret } = credentials()

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
    }),
  })

  const payload = (await response.json()) as GoogleTokenResponse
  if (!response.ok || !payload.access_token) {
    throw new Error(
      `Google: rafraîchissement impossible (${payload.error ?? response.status}). ` +
        "L'utilisateur doit probablement reconnecter son compte.",
    )
  }

  return toTokens(payload, refreshToken)
}

// ---------------------------------------------------------------------------
// Lecture des données
// ---------------------------------------------------------------------------

interface AggregateBucket {
  startTimeMillis?: string
  dataset?: {
    point?: {
      value?: { intVal?: number; fpVal?: number }[]
    }[]
  }[]
}

async function aggregate(
  accessToken: string,
  body: Record<string, unknown>,
): Promise<AggregateBucket[]> {
  const response = await fetch(AGGREGATE_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`Google Fit: agrégation refusée (${response.status}) ${detail.slice(0, 300)}`)
  }

  const payload = (await response.json()) as { bucket?: AggregateBucket[] }
  return payload.bucket ?? []
}

/** Somme les valeurs d'un dataset d'un bucket (int ou float). */
function sumDataset(bucket: AggregateBucket, datasetIndex: number): number {
  const points = bucket.dataset?.[datasetIndex]?.point ?? []
  let total = 0
  for (const point of points) {
    for (const value of point.value ?? []) {
      total += value.intVal ?? value.fpVal ?? 0
    }
  }
  return total
}

/** Moyenne des valeurs d'un dataset (la FC agrégée expose [avg, max, min]). */
function averageDataset(bucket: AggregateBucket, datasetIndex: number): number | null {
  const points = bucket.dataset?.[datasetIndex]?.point ?? []
  const values: number[] = []
  for (const point of points) {
    // Pour com.google.heart_rate.summary, value[0] = moyenne du bucket.
    const first = point.value?.[0]
    const numeric = first?.fpVal ?? first?.intVal
    if (typeof numeric === 'number' && numeric > 0) values.push(numeric)
  }
  if (values.length === 0) return null
  return values.reduce((sum, n) => sum + n, 0) / values.length
}

/** Convertit une date locale YYYY-MM-DD en bornes epoch ms (fuseau du joueur). */
function dayBounds(date: string, timeZoneOffsetMinutes: number): { start: number; end: number } {
  const startUtc = Date.parse(`${date}T00:00:00Z`)
  const start = startUtc + timeZoneOffsetMinutes * 60 * 1000
  return { start, end: start + DAY_MS }
}

/**
 * Récupère les minutes par zone cardiaque d'une journée.
 *
 * On agrège la FC par tranches de 5 minutes puis on classe chaque tranche.
 * C'est une approximation (une tranche = une seule zone), mais elle reste
 * fidèle à l'effort réel et évite de télécharger 1440 points par jour.
 */
async function fetchHeartRateZones(
  accessToken: string,
  date: string,
  offsetMinutes: number,
  maxHeartRate: number,
): Promise<ZoneMinutes> {
  const { start, end } = dayBounds(date, offsetMinutes)

  const buckets = await aggregate(accessToken, {
    aggregateBy: [{ dataTypeName: 'com.google.heart_rate.bpm' }],
    bucketByTime: { durationMillis: HR_BUCKET_MINUTES * 60 * 1000 },
    startTimeMillis: start,
    endTimeMillis: end,
  })

  const averages: number[] = []
  for (const bucket of buckets) {
    const avg = averageDataset(bucket, 0)
    if (avg !== null) averages.push(avg)
  }

  return classifyHeartRateZones(averages, HR_BUCKET_MINUTES, maxHeartRate)
}

/**
 * Récupère l'activité quotidienne sur une plage de dates.
 *
 * `offsetMinutes` est le décalage du fuseau du joueur par rapport à UTC
 * (positif à l'ouest, comme `Date.prototype.getTimezoneOffset`).
 */
export async function fetchActivity(
  accessToken: string,
  dates: string[],
  offsetMinutes: number,
  maxHeartRate: number,
): Promise<DailyActivity[]> {
  if (dates.length === 0) return []

  const first = dayBounds(dates[0], offsetMinutes)
  const last = dayBounds(dates[dates.length - 1], offsetMinutes)

  // Une seule requête pour pas / minutes actives / calories sur toute la plage.
  const buckets = await aggregate(accessToken, {
    aggregateBy: [
      {
        dataTypeName: 'com.google.step_count.delta',
        dataSourceId:
          'derived:com.google.step_count.delta:com.google.android.gms:estimated_steps',
      },
      { dataTypeName: 'com.google.active_minutes' },
      { dataTypeName: 'com.google.calories.expended' },
    ],
    bucketByTime: { durationMillis: DAY_MS },
    startTimeMillis: first.start,
    endTimeMillis: last.end,
  })

  const byDate = new Map<string, DailyActivity>()
  for (const date of dates) byDate.set(date, emptyActivity(date))

  for (const bucket of buckets) {
    const startMillis = Number(bucket.startTimeMillis ?? '0')
    if (!startMillis) continue

    // On repasse en date locale du joueur pour retrouver la bonne journée.
    const localDate = new Date(startMillis - offsetMinutes * 60 * 1000).toISOString().slice(0, 10)
    const entry = byDate.get(localDate)
    if (!entry) continue

    entry.steps = Math.round(sumDataset(bucket, 0))
    entry.activeMinutes = Math.round(sumDataset(bucket, 1))
    entry.calories = Math.round(sumDataset(bucket, 2))
  }

  // Les zones cardiaques demandent une requête plus fine, jour par jour.
  for (const date of dates) {
    const entry = byDate.get(date)
    if (!entry) continue
    try {
      const zones = await fetchHeartRateZones(accessToken, date, offsetMinutes, maxHeartRate)
      entry.fatBurnMinutes = zones.fatBurn
      entry.cardioMinutes = zones.cardio
      entry.peakMinutes = zones.peak
      entry.restingHeartRate = zones.restingEstimate
    } catch {
      // Pas de données de FC ce jour-là (montre non portée) : on garde 0
      // plutôt que de faire échouer toute la synchronisation.
    }
  }

  // Note : le sommeil n'est pas récupéré côté Google Fit. L'API expose des
  // sessions de sommeil dans un format très différent et le jeu ne s'en sert
  // pas encore — on laisse 0 plutôt que de renvoyer une valeur bancale.
  return dates.map((date) => byDate.get(date)!)
}
