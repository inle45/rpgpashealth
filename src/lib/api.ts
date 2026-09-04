import { useCallback, useEffect, useState } from 'react'
import type { CharacterClass, HealthProvider } from '@game/types.ts'
import { levelFromTotalXp, todayLocal, weekStart } from '@game/engine.ts'
import type { CharacterState } from '@game/types.ts'
import { supabase } from './supabase'

// ---------------------------------------------------------------------------
// Formes de données renvoyées par Supabase
// ---------------------------------------------------------------------------

export interface Profile {
  id: string
  display_name: string
  steps_goal: number
  active_minutes_goal: number
  max_heart_rate: number
  timezone: string
}

export interface Character {
  user_id: string
  name: string
  class: CharacterClass
}

export interface Guild {
  id: string
  name: string
  invite_code: string
  created_by: string
  companion_name: string
  companion_species: string
  companion_vitality: number
}

export interface MemberStats {
  guild_id: string
  user_id: string
  display_name: string
  steps_goal: number
  character_name: string | null
  character_class: CharacterClass | null
  total_xp: number
  total_damage: number
  total_march: number
  total_steps: number
  active_days: number
  last_active_date: string | null
}

export interface GuildTotals {
  guild_id: string
  member_count: number
  total_march: number
  total_damage: number
  total_steps: number
}

export interface BossState {
  id: string
  guild_id: string
  week_start: string
  boss_key: string
  boss_name: string
  sprite: string
  max_hp: number
  status: 'active' | 'defeated' | 'failed'
  damage_dealt: number
  hp_remaining: number
}

export interface BossContribution {
  battle_id: string
  user_id: string
  display_name: string
  damage: number
  landed_special: boolean | null
}

export interface DailyRow {
  activity_date: string
  steps: number
  active_minutes: number
  fat_burn_minutes: number
  cardio_minutes: number
  peak_minutes: number
  calories: number
  sleep_minutes: number
  resting_heart_rate: number
  xp_awarded: number
  damage_dealt: number
  march_points: number
  participated: boolean
  special_attack: boolean
  source_provider: HealthProvider | null
}

export interface Connection {
  id: string
  provider: HealthProvider
  connected_at: string
  last_sync_at: string | null
  last_sync_error: string | null
}

export interface GameState {
  profile: Profile
  character: Character | null
  characterState: CharacterState
  guild: Guild | null
  members: MemberStats[]
  totals: GuildTotals | null
  boss: BossState | null
  bossContributions: BossContribution[]
  recentDays: DailyRow[]
  connections: Connection[]
}

// ---------------------------------------------------------------------------
// Chargement
// ---------------------------------------------------------------------------

/** Charge tout l'état de jeu d'un joueur en une passe. */
export async function loadGameState(userId: string): Promise<GameState> {
  const [profileResult, characterResult, membershipResult, connectionsResult] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('characters').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('guild_members').select('guild_id').eq('user_id', userId).limit(1).maybeSingle(),
    supabase
      .from('health_connections')
      .select('id, provider, connected_at, last_sync_at, last_sync_error')
      .eq('user_id', userId),
  ])

  if (profileResult.error) throw new Error(profileResult.error.message)

  const profile = profileResult.data as Profile
  const character = (characterResult.data as Character | null) ?? null
  const connections = (connectionsResult.data as Connection[] | null) ?? []
  const guildId = (membershipResult.data as { guild_id: string } | null)?.guild_id ?? null

  // Historique personnel : 30 jours suffisent pour les graphes et la série.
  const since = new Date()
  since.setDate(since.getDate() - 29)
  const recentResult = await supabase
    .from('daily_activity')
    .select('*')
    .eq('user_id', userId)
    .gte('activity_date', since.toISOString().slice(0, 10))
    .order('activity_date', { ascending: true })

  const recentDays = (recentResult.data as DailyRow[] | null) ?? []

  let guild: Guild | null = null
  let members: MemberStats[] = []
  let totals: GuildTotals | null = null
  let boss: BossState | null = null
  let bossContributions: BossContribution[] = []

  if (guildId) {
    const monday = weekStart(todayLocal())

    const [guildResult, membersResult, totalsResult, bossResult] = await Promise.all([
      supabase.from('guilds').select('*').eq('id', guildId).single(),
      supabase
        .from('guild_member_stats')
        .select('*')
        .eq('guild_id', guildId)
        .order('total_xp', { ascending: false }),
      supabase.from('guild_totals').select('*').eq('guild_id', guildId).maybeSingle(),
      supabase
        .from('boss_battle_state')
        .select('*')
        .eq('guild_id', guildId)
        .eq('week_start', monday)
        .maybeSingle(),
    ])

    guild = (guildResult.data as Guild | null) ?? null
    members = (membersResult.data as MemberStats[] | null) ?? []
    totals = (totalsResult.data as GuildTotals | null) ?? null
    boss = (bossResult.data as BossState | null) ?? null

    if (boss) {
      const contributionsResult = await supabase
        .from('boss_contributions')
        .select('*')
        .eq('battle_id', boss.id)
        .order('damage', { ascending: false })
      bossContributions = (contributionsResult.data as BossContribution[] | null) ?? []
    }
  }

  // Le niveau se dérive de l'XP totale : rien à stocker, rien qui dérive.
  const totalXp = members.find((m) => m.user_id === userId)?.total_xp ?? sumXp(recentDays)
  const characterState = levelFromTotalXp(totalXp)

  return {
    profile,
    character,
    characterState,
    guild,
    members,
    totals,
    boss,
    bossContributions,
    recentDays,
    connections,
  }
}

/**
 * Repli quand le joueur n'est dans aucune guilde : la vue `guild_member_stats`
 * ne renvoie alors rien, mais l'XP des 30 derniers jours reste consultable.
 */
function sumXp(rows: DailyRow[]): number {
  return rows.reduce((total, row) => total + row.xp_awarded, 0)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface GameStateHook {
  state: GameState | null
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

export function useGameState(userId: string | null): GameStateHook {
  const [state, setState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setState(null)
      setLoading(false)
      return
    }

    try {
      setError(null)
      const next = await loadGameState(userId)
      setState(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'chargement impossible')
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    setLoading(true)
    void refresh()
  }, [refresh])

  return { state, loading, error, refresh }
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export async function createGuild(name: string): Promise<Guild> {
  const { data, error } = await supabase.rpc('create_guild', { guild_name: name })
  if (error) throw new Error(error.message)
  return data as Guild
}

export async function joinGuild(code: string): Promise<Guild> {
  const { data, error } = await supabase.rpc('join_guild', { code })
  if (error) throw new Error(translateRpcError(error.message))
  return data as Guild
}

export async function updateProfile(userId: string, patch: Partial<Profile>): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw new Error(error.message)
}

export async function updateCharacter(userId: string, patch: Partial<Character>): Promise<void> {
  const { error } = await supabase
    .from('characters')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

export async function disconnectProvider(connectionId: string): Promise<void> {
  const { error } = await supabase.from('health_connections').delete().eq('id', connectionId)
  if (error) throw new Error(error.message)
}

function translateRpcError(message: string): string {
  if (message.includes("code d'invitation inconnu")) {
    return "Ce code d'invitation n'existe pas. Vérifie les 6 caractères."
  }
  return message
}
