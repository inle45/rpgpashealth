import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import { computeContribution, computeStreak, dateRange, shiftDate } from '../../../shared/game/engine.ts'
import type { CharacterClass, DailyActivity, HealthProvider } from '../../../shared/game/types.ts'
import { emptyActivity } from './activity.ts'
import * as googleFit from './google-fit.ts'
import * as fitbit from './fitbit.ts'
import { ensureWeeklyBoss, localDate, resolveFinishedBattles, timezoneOffsetMinutes } from './guild.ts'

/** Marge avant expiration en dessous de laquelle on rafraîchit le jeton. */
const REFRESH_MARGIN_MS = 2 * 60 * 1000

/** Profondeur d'historique consultée pour reconstituer la série en cours. */
const STREAK_LOOKBACK_DAYS = 60

export interface SyncResult {
  userId: string
  daysSynced: number
  providers: HealthProvider[]
  errors: string[]
}

interface ConnectionRow {
  id: string
  provider: HealthProvider
  health_tokens: {
    access_token: string
    refresh_token: string | null
    expires_at: string | null
  } | null
}

/**
 * Renvoie un access token valide pour une connexion, en le rafraîchissant si
 * nécessaire (et en persistant le nouveau — Fitbit fait tourner le refresh
 * token à chaque appel, donc l'ancien devient inutilisable).
 */
async function validAccessToken(
  supabase: SupabaseClient,
  connection: ConnectionRow,
): Promise<string> {
  const tokens = connection.health_tokens
  if (!tokens) {
    throw new Error('aucun jeton enregistré — reconnecte le compte')
  }

  const expiresAt = tokens.expires_at ? Date.parse(tokens.expires_at) : null
  const stillValid = expiresAt === null || expiresAt - Date.now() > REFRESH_MARGIN_MS
  if (stillValid) return tokens.access_token

  if (!tokens.refresh_token) {
    throw new Error('jeton expiré et aucun refresh token — reconnecte le compte')
  }

  const refreshed =
    connection.provider === 'google_fit'
      ? await googleFit.refreshTokens(tokens.refresh_token)
      : await fitbit.refreshTokens(tokens.refresh_token)

  await supabase
    .from('health_tokens')
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      expires_at: refreshed.expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('connection_id', connection.id)

  return refreshed.accessToken
}

/**
 * Fusionne les données de plusieurs providers pour une même journée.
 *
 * On prend le maximum métrique par métrique plutôt que la somme : quelqu'un
 * qui porte sa montre ET a son téléphone en poche compterait sinon ses pas
 * deux fois.
 */
function mergeActivity(target: DailyActivity, incoming: DailyActivity): DailyActivity {
  return {
    date: target.date,
    steps: Math.max(target.steps, incoming.steps),
    activeMinutes: Math.max(target.activeMinutes, incoming.activeMinutes),
    fatBurnMinutes: Math.max(target.fatBurnMinutes, incoming.fatBurnMinutes),
    cardioMinutes: Math.max(target.cardioMinutes, incoming.cardioMinutes),
    peakMinutes: Math.max(target.peakMinutes, incoming.peakMinutes),
    calories: Math.max(target.calories, incoming.calories),
    sleepMinutes: Math.max(target.sleepMinutes, incoming.sleepMinutes),
    restingHeartRate: Math.max(target.restingHeartRate, incoming.restingHeartRate),
  }
}

/** Synchronise un joueur et recalcule ses contributions de jeu. */
export async function syncUser(
  supabase: SupabaseClient,
  userId: string,
  days: number,
): Promise<SyncResult> {
  const errors: string[] = []
  const usedProviders: HealthProvider[] = []

  // --- Profil et personnage ------------------------------------------------
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('steps_goal, active_minutes_goal, max_heart_rate, timezone')
    .eq('id', userId)
    .single()

  if (profileError || !profile) {
    throw new Error(`profil introuvable: ${profileError?.message ?? 'aucune ligne'}`)
  }

  const { data: character } = await supabase
    .from('characters')
    .select('class')
    .eq('user_id', userId)
    .maybeSingle()

  const characterClass = (character?.class ?? 'ranger') as CharacterClass
  const goals = {
    stepsGoal: profile.steps_goal as number,
    activeMinutesGoal: profile.active_minutes_goal as number,
  }

  // --- Plage de dates dans le fuseau du joueur -----------------------------
  const timeZone = (profile.timezone as string) || 'UTC'
  const today = localDate(timeZone)
  const from = shiftDate(today, -(Math.max(1, days) - 1))
  const dates = dateRange(from, today)
  const offsetMinutes = timezoneOffsetMinutes(timeZone, new Date())

  // --- Connexions santé ----------------------------------------------------
  const { data: connections } = await supabase
    .from('health_connections')
    .select('id, provider, health_tokens(access_token, refresh_token, expires_at)')
    .eq('user_id', userId)

  const rows = (connections ?? []) as unknown as ConnectionRow[]
  if (rows.length === 0) {
    return { userId, daysSynced: 0, providers: [], errors: ['aucun compte santé connecté'] }
  }

  // --- Récupération et fusion ---------------------------------------------
  const merged = new Map<string, DailyActivity>()
  for (const date of dates) merged.set(date, emptyActivity(date))
  const sourceByDate = new Map<string, HealthProvider>()

  for (const connection of rows) {
    try {
      const accessToken = await validAccessToken(supabase, connection)

      const fetched =
        connection.provider === 'google_fit'
          ? await googleFit.fetchActivity(
              accessToken,
              dates,
              offsetMinutes,
              profile.max_heart_rate as number,
            )
          : await fitbit.fetchActivity(accessToken, dates)

      for (const activity of fetched) {
        const current = merged.get(activity.date)
        if (!current) continue
        // On note le provider qui apporte le plus de pas : c'est lui qui sera
        // affiché comme source de la journée.
        if (activity.steps > current.steps) sourceByDate.set(activity.date, connection.provider)
        merged.set(activity.date, mergeActivity(current, activity))
      }

      usedProviders.push(connection.provider)
      await supabase
        .from('health_connections')
        .update({ last_sync_at: new Date().toISOString(), last_sync_error: null })
        .eq('id', connection.id)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'erreur inconnue'
      errors.push(`${connection.provider}: ${message}`)
      await supabase
        .from('health_connections')
        .update({ last_sync_error: message })
        .eq('id', connection.id)
    }
  }

  if (usedProviders.length === 0) {
    return { userId, daysSynced: 0, providers: [], errors }
  }

  // --- Historique de participation, pour la série en cours -----------------
  const { data: history } = await supabase
    .from('daily_activity')
    .select('activity_date, participated')
    .eq('user_id', userId)
    .gte('activity_date', shiftDate(from, -STREAK_LOOKBACK_DAYS))
    .lt('activity_date', from)

  const participation = ((history ?? []) as { activity_date: string; participated: boolean }[]).map(
    (row) => ({ date: row.activity_date, participated: row.participated }),
  )

  // --- Calcul des contributions, dans l'ordre chronologique ----------------
  // L'ordre compte : la série d'un jour dépend des jours qui le précèdent.
  const payload = dates.map((date) => {
    const activity = merged.get(date)!
    const streak = computeStreak(participation, shiftDate(date, -1))
    const contribution = computeContribution(activity, goals, characterClass, streak)

    participation.push({ date, participated: contribution.participated })

    return {
      user_id: userId,
      activity_date: date,
      steps: activity.steps,
      active_minutes: activity.activeMinutes,
      fat_burn_minutes: activity.fatBurnMinutes,
      cardio_minutes: activity.cardioMinutes,
      peak_minutes: activity.peakMinutes,
      calories: activity.calories,
      sleep_minutes: activity.sleepMinutes,
      resting_heart_rate: activity.restingHeartRate,
      xp_awarded: contribution.xp,
      damage_dealt: contribution.damage,
      march_points: contribution.marchPoints,
      participated: contribution.participated,
      special_attack: contribution.specialAttack,
      source_provider: sourceByDate.get(date) ?? usedProviders[0],
      synced_at: new Date().toISOString(),
    }
  })

  const { error: upsertError } = await supabase
    .from('daily_activity')
    .upsert(payload, { onConflict: 'user_id,activity_date' })

  if (upsertError) {
    throw new Error(`écriture de l'activité impossible: ${upsertError.message}`)
  }

  // --- Entretien des combats de boss des guildes du joueur -----------------
  const { data: memberships } = await supabase
    .from('guild_members')
    .select('guild_id')
    .eq('user_id', userId)

  for (const membership of (memberships ?? []) as { guild_id: string }[]) {
    try {
      await ensureWeeklyBoss(supabase, membership.guild_id, today)
      await resolveFinishedBattles(supabase, membership.guild_id, today)
    } catch (error) {
      errors.push(
        `boss (guilde ${membership.guild_id}): ${
          error instanceof Error ? error.message : 'erreur inconnue'
        }`,
      )
    }
  }

  return { userId, daysSynced: payload.length, providers: usedProviders, errors }
}
