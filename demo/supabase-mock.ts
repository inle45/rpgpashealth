/**
 * Faux client Supabase, utilisé UNIQUEMENT par `vite.demo.config.ts` pour
 * afficher l'app avec des données de démonstration (captures d'écran, revue
 * visuelle) sans base de données.
 *
 * Il n'est jamais inclus dans le build de production : le plugin qui le
 * substitue ne tourne que dans la configuration de démo.
 */
import type { Session } from '@supabase/supabase-js'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TODAY = new Date().toISOString().slice(0, 10)

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function mondayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

// Quinze jours d'activité plausible : quelques gros jours, quelques creux.
const STEP_PATTERN = [
  9200, 12400, 4100, 8800, 15200, 6500, 3200, 10100, 11800, 7400, 9900, 5200, 13100, 8600, 6800,
]
const CARDIO_PATTERN = [12, 28, 0, 8, 34, 4, 0, 18, 25, 6, 14, 0, 31, 11, 9]

const DAILY = STEP_PATTERN.map((steps, index) => {
  const date = daysAgo(STEP_PATTERN.length - 1 - index)
  const cardio = CARDIO_PATTERN[index]
  return {
    user_id: USER_ID,
    activity_date: date,
    steps,
    active_minutes: Math.round(steps / 220),
    fat_burn_minutes: Math.round(cardio * 1.6),
    cardio_minutes: cardio,
    peak_minutes: cardio > 25 ? Math.round(cardio * 0.25) : 0,
    calories: Math.round(steps * 0.045),
    sleep_minutes: 420,
    resting_heart_rate: 58,
    xp_awarded: Math.round((steps / 8000) * 100 + Math.round(steps / 220) * 2),
    damage_dealt: Math.round(cardio * 3 + Math.round(cardio * 1.6)),
    march_points: Math.min(200, Math.round((steps / 8000) * 100)),
    participated: steps >= 4000,
    special_attack: cardio >= 20,
    source_provider: 'fitbit',
  }
})

const GUILD = {
  id: 'guild-1',
  name: 'Les Chevaliers du Canapé',
  invite_code: 'K7X2M9',
  created_by: USER_ID,
  companion_name: 'Pyra',
  companion_species: 'fox_spirit',
  companion_vitality: 78,
}

const MEMBERS = [
  {
    guild_id: GUILD.id,
    user_id: USER_ID,
    display_name: 'Toi',
    steps_goal: 8000,
    active_minutes_goal: 30,
    character_name: 'Aldric',
    character_class: 'ranger',
    total_xp: 2840,
    total_damage: 1420,
    total_march: 1380,
    total_steps: 132300,
    active_days: 13,
    last_active_date: TODAY,
  },
  {
    guild_id: GUILD.id,
    user_id: 'user-2',
    display_name: 'Marou',
    steps_goal: 6000,
    active_minutes_goal: 25,
    character_name: 'Brakk',
    character_class: 'berserker',
    total_xp: 2310,
    total_damage: 2180,
    total_march: 1050,
    total_steps: 94100,
    active_days: 12,
    last_active_date: TODAY,
  },
  {
    guild_id: GUILD.id,
    user_id: 'user-3',
    display_name: 'Sam',
    steps_goal: 10000,
    active_minutes_goal: 40,
    character_name: 'Elenor',
    character_class: 'paladin',
    total_xp: 1960,
    total_damage: 890,
    total_march: 1240,
    total_steps: 118600,
    active_days: 10,
    last_active_date: daysAgo(1),
  },
]

const BOSS = {
  id: 'battle-1',
  guild_id: GUILD.id,
  week_start: mondayOf(TODAY),
  boss_key: 'stone_golem',
  boss_name: 'Golem de Pierre',
  sprite: '/sprites/boss-stone-golem.png',
  max_hp: 5400,
  status: 'active',
  resolved_at: null,
  damage_dealt: 3120,
  hp_remaining: 2280,
}

const TABLES: Record<string, unknown[]> = {
  profiles: [
    {
      id: USER_ID,
      display_name: 'Toi',
      steps_goal: 8000,
      active_minutes_goal: 30,
      max_heart_rate: 190,
      timezone: 'Europe/Paris',
    },
  ],
  characters: [{ user_id: USER_ID, name: 'Aldric', class: 'ranger' }],
  guild_members: [{ guild_id: GUILD.id, user_id: USER_ID, role: 'owner' }],
  guilds: [GUILD],
  guild_member_stats: MEMBERS,
  guild_totals: [
    {
      guild_id: GUILD.id,
      member_count: 3,
      total_march: 3670,
      total_damage: 4490,
      total_steps: 345000,
    },
  ],
  boss_battle_state: [BOSS],
  boss_contributions: [
    {
      battle_id: BOSS.id,
      guild_id: GUILD.id,
      user_id: 'user-2',
      display_name: 'Marou',
      damage: 1580,
      landed_special: true,
    },
    {
      battle_id: BOSS.id,
      guild_id: GUILD.id,
      user_id: USER_ID,
      display_name: 'Toi',
      damage: 1020,
      landed_special: true,
    },
    {
      battle_id: BOSS.id,
      guild_id: GUILD.id,
      user_id: 'user-3',
      display_name: 'Sam',
      damage: 520,
      landed_special: false,
    },
  ],
  daily_activity: DAILY,
  health_connections: [
    {
      id: 'conn-1',
      user_id: USER_ID,
      provider: 'fitbit',
      connected_at: daysAgo(20),
      last_sync_at: new Date().toISOString(),
      last_sync_error: null,
    },
  ],
}

/** Constructeur de requête minimal : `.select().eq().order()` etc. */
function queryBuilder(table: string) {
  const filters: [string, unknown][] = []

  const resolve = () => {
    let rows = [...(TABLES[table] ?? [])] as Record<string, unknown>[]
    for (const [column, value] of filters) {
      rows = rows.filter((row) => row[column] === value)
    }
    return rows
  }

  const builder: Record<string, unknown> = {
    select: () => builder,
    eq: (column: string, value: unknown) => {
      filters.push([column, value])
      return builder
    },
    gte: () => builder,
    lt: () => builder,
    lte: () => builder,
    in: () => builder,
    order: () => builder,
    limit: () => builder,
    single: () => Promise.resolve({ data: resolve()[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: resolve()[0] ?? null, error: null }),
    update: () => builder,
    upsert: () => builder,
    delete: () => builder,
    // Rend le builder « thenable » pour que `await query` renvoie les lignes.
    then: (onFulfilled: (value: { data: unknown; error: null }) => unknown) =>
      Promise.resolve({ data: resolve(), error: null }).then(onFulfilled),
  }

  return builder
}

const SESSION = {
  access_token: 'demo',
  token_type: 'bearer',
  expires_in: 3600,
  refresh_token: 'demo',
  user: { id: USER_ID, email: 'demo@guildquest.local' },
} as unknown as Session

export const supabase = {
  from: (table: string) => queryBuilder(table),
  rpc: () => Promise.resolve({ data: GUILD, error: null }),
  auth: {
    getSession: () => Promise.resolve({ data: { session: SESSION }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.resolve({ error: null }),
    signUp: () => Promise.resolve({ error: null }),
    signOut: () => Promise.resolve({ error: null }),
  },
  functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
} as never

export function appUrl(): string {
  return window.location.origin
}

export async function callFunction<T>(): Promise<T> {
  return { daysSynced: 7, providers: ['fitbit'], errors: [] } as unknown as T
}
