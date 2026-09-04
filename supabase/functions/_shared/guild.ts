import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'
import {
  applyCompanionDelta,
  computeBossHp,
  pickBoss,
  shiftDate,
  weekIndex,
  weekStart,
} from '../../../shared/game/engine.ts'
import { RULES } from '../../../shared/game/rules.ts'

/**
 * S'assure qu'un boss existe pour la semaine en cours dans chaque guilde
 * donnée. Idempotent : la contrainte d'unicité (guild_id, week_start) rend
 * l'appel répétable sans risque de doublon.
 */
export async function ensureWeeklyBoss(
  supabase: SupabaseClient,
  guildId: string,
  today: string,
): Promise<void> {
  const monday = weekStart(today)

  const { data: existing } = await supabase
    .from('boss_battles')
    .select('id')
    .eq('guild_id', guildId)
    .eq('week_start', monday)
    .maybeSingle()

  if (existing) return

  // Taille de la guilde et historique de dégâts, pour calibrer la difficulté.
  const { data: members } = await supabase
    .from('guild_members')
    .select('user_id')
    .eq('guild_id', guildId)

  const memberIds = (members ?? []).map((m: { user_id: string }) => m.user_id)
  if (memberIds.length === 0) return

  const pastWeeklyDamage = await weeklyDamageHistory(supabase, memberIds, monday, 4)
  const boss = pickBoss(weekIndex(today))
  const maxHp = computeBossHp(memberIds.length, pastWeeklyDamage, boss)

  await supabase.from('boss_battles').insert({
    guild_id: guildId,
    week_start: monday,
    boss_key: boss.key,
    boss_name: boss.name,
    sprite: boss.sprite,
    max_hp: maxHp,
    status: 'active',
  })
}

/**
 * Dégâts totaux infligés par un groupe de joueurs lors des `weeks` semaines
 * précédant `beforeMonday`, la plus récente en premier.
 */
async function weeklyDamageHistory(
  supabase: SupabaseClient,
  memberIds: string[],
  beforeMonday: string,
  weeks: number,
): Promise<number[]> {
  const from = shiftDate(beforeMonday, -7 * weeks)

  const { data } = await supabase
    .from('daily_activity')
    .select('activity_date, damage_dealt')
    .in('user_id', memberIds)
    .gte('activity_date', from)
    .lt('activity_date', beforeMonday)

  const totals = new Map<string, number>()
  for (const row of (data ?? []) as { activity_date: string; damage_dealt: number }[]) {
    const monday = weekStart(row.activity_date)
    totals.set(monday, (totals.get(monday) ?? 0) + (row.damage_dealt ?? 0))
  }

  return [...totals.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([, total]) => total)
}

/** Clôt les combats de boss dont la semaine est terminée. */
export async function resolveFinishedBattles(
  supabase: SupabaseClient,
  guildId: string,
  today: string,
): Promise<void> {
  const currentMonday = weekStart(today)

  const { data: battles } = await supabase
    .from('boss_battle_state')
    .select('id, week_start, max_hp, damage_dealt, status')
    .eq('guild_id', guildId)
    .eq('status', 'active')

  for (const battle of (battles ?? []) as {
    id: string
    week_start: string
    max_hp: number
    damage_dealt: number
    status: string
  }[]) {
    const vanquished = battle.damage_dealt >= battle.max_hp
    const weekOver = battle.week_start < currentMonday

    // Un boss tombé est clos immédiatement ; un boss encore debout n'est
    // déclaré "raté" qu'une fois sa semaine écoulée.
    if (!vanquished && !weekOver) continue

    // La transition depuis 'active' n'a lieu qu'une fois : le filtre
    // `.eq('status', 'active')` rend l'ajustement du compagnon idempotent
    // même si le tick tourne plusieurs fois dans la journée.
    const { data: updated } = await supabase
      .from('boss_battles')
      .update({
        status: vanquished ? 'defeated' : 'failed',
        resolved_at: new Date().toISOString(),
      })
      .eq('id', battle.id)
      .eq('status', 'active')
      .select('id')

    if (!updated || updated.length === 0) continue

    await adjustCompanionVitality(
      supabase,
      guildId,
      vanquished ? RULES.COMPANION_BOSS_WIN_BONUS : RULES.COMPANION_BOSS_FAIL_MALUS,
    )
  }
}

/** Applique une variation ponctuelle à la vitalité du compagnon d'une guilde. */
async function adjustCompanionVitality(
  supabase: SupabaseClient,
  guildId: string,
  delta: number,
): Promise<void> {
  const { data: guild } = await supabase
    .from('guilds')
    .select('companion_vitality')
    .eq('id', guildId)
    .maybeSingle()

  if (!guild) return

  await supabase
    .from('guilds')
    .update({ companion_vitality: applyCompanionDelta(guild.companion_vitality, delta) })
    .eq('id', guildId)
}

/** Décalage (en minutes, convention `getTimezoneOffset`) d'un fuseau IANA. */
export function timezoneOffsetMinutes(timeZone: string, at: Date): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

    const parts = formatter.formatToParts(at)
    const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0')

    const asUtc = Date.UTC(
      value('year'),
      value('month') - 1,
      value('day'),
      value('hour') === 24 ? 0 : value('hour'),
      value('minute'),
      value('second'),
    )

    return Math.round((at.getTime() - asUtc) / 60000)
  } catch {
    return 0
  }
}

/** Date locale (YYYY-MM-DD) d'un joueur dans son fuseau. */
export function localDate(timeZone: string, at: Date = new Date()): string {
  const offset = timezoneOffsetMinutes(timeZone, at)
  return new Date(at.getTime() - offset * 60000).toISOString().slice(0, 10)
}
