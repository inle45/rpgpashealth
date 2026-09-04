/**
 * Passage quotidien, déclenché par un cron (voir docs/SETUP.md).
 *
 * 1. resynchronise tous les joueurs connectés ;
 * 2. fait avancer la vitalité du compagnon de chaque guilde, jour par jour.
 *
 * Protégée par un secret partagé plutôt que par un JWT utilisateur : le cron
 * n'agit au nom de personne en particulier.
 */
import { handlePreflight, jsonResponse } from '../_shared/cors.ts'
import { adminClient } from '../_shared/supabase.ts'
import { syncUser } from '../_shared/sync.ts'
import { applyCompanionDelta, companionDailyDelta, shiftDate } from '../../../shared/game/engine.ts'
import { ensureWeeklyBoss, localDate, resolveFinishedBattles } from '../_shared/guild.ts'

/** Fenêtre de rattrapage : au-delà, on ne remonte pas plus loin. */
const CATCH_UP_DAYS = 14
const SYNC_DAYS = 3

Deno.serve(async (req) => {
  const preflight = handlePreflight(req)
  if (preflight) return preflight

  const expected = Deno.env.get('CRON_SECRET')
  if (!expected) {
    return jsonResponse({ error: 'CRON_SECRET non configuré' }, 500)
  }
  if (req.headers.get('x-cron-secret') !== expected) {
    return jsonResponse({ error: 'non autorisé' }, 401)
  }

  const supabase = adminClient()
  const report = { usersSynced: 0, guildsTicked: 0, errors: [] as string[] }

  // --- 1. Resynchronisation de tous les joueurs connectés ------------------
  const { data: connectedUsers } = await supabase
    .from('health_connections')
    .select('user_id')

  const userIds = [...new Set((connectedUsers ?? []).map((row: { user_id: string }) => row.user_id))]

  for (const userId of userIds) {
    try {
      await syncUser(supabase, userId, SYNC_DAYS)
      report.usersSynced += 1
    } catch (error) {
      report.errors.push(
        `sync ${userId}: ${error instanceof Error ? error.message : 'erreur inconnue'}`,
      )
    }
  }

  // --- 2. Vitalité du compagnon, guilde par guilde -------------------------
  const { data: guilds } = await supabase
    .from('guilds')
    .select('id, companion_vitality, companion_last_tick_date')

  const todayUtc = localDate('UTC')
  const yesterday = shiftDate(todayUtc, -1)

  for (const guild of (guilds ?? []) as {
    id: string
    companion_vitality: number
    companion_last_tick_date: string | null
  }[]) {
    try {
      await ensureWeeklyBoss(supabase, guild.id, todayUtc)
      await resolveFinishedBattles(supabase, guild.id, todayUtc)

      // On ne traite que les journées terminées, une seule fois chacune :
      // `companion_last_tick_date` sert de garde d'idempotence.
      const lastTick = guild.companion_last_tick_date
      const startFrom = lastTick
        ? shiftDate(lastTick, 1)
        : shiftDate(yesterday, -(CATCH_UP_DAYS - 1))

      if (startFrom > yesterday) continue

      const { data: members } = await supabase
        .from('guild_members')
        .select('user_id')
        .eq('guild_id', guild.id)

      const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)
      if (memberIds.length === 0) continue

      const { data: activity } = await supabase
        .from('daily_activity')
        .select('activity_date, participated')
        .in('user_id', memberIds)
        .gte('activity_date', startFrom)
        .lte('activity_date', yesterday)
        .eq('participated', true)

      const participantsByDate = new Map<string, number>()
      for (const row of (activity ?? []) as { activity_date: string }[]) {
        participantsByDate.set(
          row.activity_date,
          (participantsByDate.get(row.activity_date) ?? 0) + 1,
        )
      }

      let vitality = guild.companion_vitality
      let cursor = startFrom
      for (let i = 0; i < CATCH_UP_DAYS && cursor <= yesterday; i += 1) {
        const rate = (participantsByDate.get(cursor) ?? 0) / memberIds.length
        vitality = applyCompanionDelta(vitality, companionDailyDelta(rate))
        cursor = shiftDate(cursor, 1)
      }

      await supabase
        .from('guilds')
        .update({ companion_vitality: vitality, companion_last_tick_date: yesterday })
        .eq('id', guild.id)

      report.guildsTicked += 1
    } catch (error) {
      report.errors.push(
        `guilde ${guild.id}: ${error instanceof Error ? error.message : 'erreur inconnue'}`,
      )
    }
  }

  return jsonResponse(report)
})
