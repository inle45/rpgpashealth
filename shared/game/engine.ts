import { BOSSES, CAMPAIGN, CLASS_BONUSES, RULES } from './rules.ts'
import type {
  BossDefinition,
  CampaignRegion,
  CharacterClass,
  CharacterState,
  CompanionMood,
  DailyActivity,
  DailyContribution,
  LevelUpResult,
  PlayerGoals,
} from './types.ts'

// ---------------------------------------------------------------------------
// Progression du personnage
// ---------------------------------------------------------------------------

/** XP nécessaire pour passer du niveau `level` au suivant. */
export function xpToNextLevel(level: number): number {
  return Math.round(80 * Math.pow(Math.max(1, level), 1.35))
}

/**
 * Dérive le niveau et l'XP courante depuis l'XP totale.
 *
 * Le niveau n'est jamais stocké : il se recalcule à partir de la somme des
 * gains quotidiens. Une resynchronisation qui corrige une vieille journée
 * remet donc automatiquement la progression d'aplomb, sans dérive possible.
 */
export function levelFromTotalXp(totalXp: number): CharacterState {
  let level = 1
  let remaining = Math.max(0, Math.round(totalXp))

  while (level < 500) {
    const needed = xpToNextLevel(level)
    if (remaining < needed) break
    remaining -= needed
    level += 1
  }

  return { level, xp: remaining, totalXp: Math.max(0, Math.round(totalXp)) }
}

/** XP restante avant le prochain niveau. */
export function xpRemaining(state: CharacterState): number {
  return Math.max(0, xpToNextLevel(state.level) - state.xp)
}

/** Applique un gain d'XP et fait monter le niveau autant de fois que possible. */
export function applyXp(state: CharacterState, gainedXp: number): LevelUpResult {
  let { level, xp } = state
  const totalXp = state.totalXp + Math.max(0, gainedXp)
  xp += Math.max(0, gainedXp)

  let levelsGained = 0
  // Garde-fou : une resynchronisation de plusieurs mois d'un coup ne doit pas
  // partir en boucle infinie si la courbe d'XP est un jour mal réglée.
  while (levelsGained < 500) {
    const needed = xpToNextLevel(level)
    if (xp < needed) break
    xp -= needed
    level += 1
    levelsGained += 1
  }

  return { level, xp, totalXp, levelsGained }
}

// ---------------------------------------------------------------------------
// Contribution quotidienne
// ---------------------------------------------------------------------------

/** Ratio d'objectif de pas atteint, plafonné pour rester équitable. */
export function goalRatio(steps: number, goals: PlayerGoals): number {
  const target = Math.max(1, goals.stepsGoal)
  return Math.min(RULES.MAX_GOAL_RATIO, Math.max(0, steps) / target)
}

/** Multiplicateur d'XP issu de la série de jours consécutifs. */
export function streakMultiplier(streakDays: number): number {
  const capped = Math.min(Math.max(0, streakDays), RULES.MAX_STREAK_DAYS)
  return 1 + capped * RULES.STREAK_BONUS_PER_DAY
}

/**
 * Convertit une journée d'activité brute en contribution de jeu.
 *
 * C'est LA fonction centrale : XP perso, dégâts au boss et avancée sur la
 * carte sortent tous d'ici, à partir des mêmes données normalisées.
 */
export function computeContribution(
  activity: DailyActivity,
  goals: PlayerGoals,
  characterClass: CharacterClass,
  streakDays: number,
): DailyContribution {
  const bonuses = CLASS_BONUSES[characterClass]
  const ratio = goalRatio(activity.steps, goals)
  const multiplier = streakMultiplier(streakDays)

  // --- XP : volume de pas + minutes actives, boostés par la série ----------
  const rawXp =
    ratio * RULES.XP_PER_GOAL + Math.max(0, activity.activeMinutes) * RULES.XP_PER_ACTIVE_MINUTE
  const xp = Math.round(rawXp * multiplier * bonuses.xpMultiplier)

  // --- Dégâts : uniquement le temps passé en zone cardiaque ----------------
  const intenseMinutes = Math.max(0, activity.cardioMinutes) + Math.max(0, activity.peakMinutes)
  const specialAttack = intenseMinutes >= RULES.SPECIAL_ATTACK_MINUTES

  const rawDamage =
    Math.max(0, activity.fatBurnMinutes) * RULES.DAMAGE_PER_FAT_BURN_MINUTE +
    Math.max(0, activity.cardioMinutes) * RULES.DAMAGE_PER_CARDIO_MINUTE +
    Math.max(0, activity.peakMinutes) * RULES.DAMAGE_PER_PEAK_MINUTE
  const damage = Math.round(
    rawDamage * (specialAttack ? RULES.SPECIAL_ATTACK_MULTIPLIER : 1) * bonuses.damageMultiplier,
  )

  // --- Marche : la progression collective sur la carte ---------------------
  const marchPoints = Math.round(ratio * RULES.MARCH_PER_GOAL * bonuses.marchMultiplier)

  return {
    date: activity.date,
    goalRatio: ratio,
    xp,
    damage,
    marchPoints,
    participated: ratio >= RULES.PARTICIPATION_RATIO,
    specialAttack,
    streakMultiplier: multiplier,
  }
}

/**
 * Calcule la série en cours à partir de l'historique, du plus récent au plus
 * ancien. Un jour sans participation casse la série.
 */
export function computeStreak(
  history: { date: string; participated: boolean }[],
  today: string,
): number {
  const byDate = new Map(history.map((entry) => [entry.date, entry.participated]))
  let streak = 0
  let cursor = today

  // La journée en cours ne casse pas la série tant qu'elle n'est pas finie :
  // on démarre la vérification la veille si aujourd'hui n'est pas encore validé.
  if (!byDate.get(cursor)) {
    cursor = shiftDate(cursor, -1)
  }

  while (byDate.get(cursor)) {
    streak += 1
    cursor = shiftDate(cursor, -1)
  }

  return streak
}

// ---------------------------------------------------------------------------
// Boss hebdomadaire
// ---------------------------------------------------------------------------

/**
 * Calibre les PV du boss sur la forme réelle de la guilde.
 *
 * `pastWeeklyDamage` = dégâts totaux infligés lors des semaines précédentes
 * (la plus récente en premier). Sans historique, on retombe sur un plancher
 * proportionnel à la taille de la guilde.
 */
export function computeBossHp(
  memberCount: number,
  pastWeeklyDamage: number[],
  boss: BossDefinition,
): number {
  const members = Math.max(1, memberCount)
  const floor = members * RULES.BOSS_HP_FLOOR_PER_MEMBER

  const sample = pastWeeklyDamage.slice(0, RULES.BOSS_CALIBRATION_WEEKS).filter((n) => n > 0)
  const calibrated =
    sample.length > 0
      ? (sample.reduce((sum, n) => sum + n, 0) / sample.length) * RULES.BOSS_HP_TARGET_RATIO
      : floor

  return Math.round(Math.max(floor, calibrated) * boss.hpMultiplier)
}

/** Choisit le boss de la semaine (rotation déterministe). */
export function pickBoss(weekIndex: number): BossDefinition {
  const index = ((weekIndex % BOSSES.length) + BOSSES.length) % BOSSES.length
  return BOSSES[index]
}

// ---------------------------------------------------------------------------
// Compagnon de guilde
// ---------------------------------------------------------------------------

/** Variation de vitalité du compagnon pour une journée donnée. */
export function companionDailyDelta(participationRate: number): number {
  for (const tier of RULES.COMPANION_DELTAS) {
    if (participationRate >= tier.minParticipation) return tier.delta
  }
  return RULES.COMPANION_DELTAS[RULES.COMPANION_DELTAS.length - 1].delta
}

/** Applique une variation en gardant la vitalité dans [0, 100]. */
export function applyCompanionDelta(vitality: number, delta: number): number {
  return Math.min(RULES.COMPANION_MAX_VITALITY, Math.max(0, Math.round(vitality + delta)))
}

/** État visuel du compagnon selon sa vitalité. */
export function companionMood(vitality: number): CompanionMood {
  if (vitality >= 80) return 'thriving'
  if (vitality >= 55) return 'healthy'
  if (vitality >= 30) return 'weak'
  if (vitality >= 1) return 'sick'
  return 'dormant'
}

export const COMPANION_MOOD_LABELS: Record<CompanionMood, string> = {
  thriving: 'Rayonnant',
  healthy: 'En forme',
  weak: 'Fatigué',
  sick: 'Mal en point',
  dormant: 'Endormi',
}

// ---------------------------------------------------------------------------
// Carte de campagne
// ---------------------------------------------------------------------------

/** Points de marche nécessaires pour capturer une région. */
export function regionRequirement(region: CampaignRegion, memberCount: number): number {
  return region.marchPerMember * Math.max(1, memberCount)
}

/**
 * Répartit le total de points de marche de la guilde sur les régions dans
 * l'ordre : chaque région se remplit avant que la suivante ne commence.
 */
export function campaignProgress(
  totalMarchPoints: number,
  memberCount: number,
): { region: CampaignRegion; required: number; progress: number; captured: boolean }[] {
  let remaining = Math.max(0, totalMarchPoints)

  return [...CAMPAIGN]
    .sort((a, b) => a.order - b.order)
    .map((region) => {
      const required = regionRequirement(region, memberCount)
      const progress = Math.min(remaining, required)
      remaining -= progress
      return { region, required, progress, captured: progress >= required }
    })
}

/** La région où la guilde se trouve actuellement (première non capturée). */
export function currentRegion(totalMarchPoints: number, memberCount: number) {
  const progress = campaignProgress(totalMarchPoints, memberCount)
  return progress.find((entry) => !entry.captured) ?? progress[progress.length - 1]
}

// ---------------------------------------------------------------------------
// Utilitaires de date (UTC, format YYYY-MM-DD)
// ---------------------------------------------------------------------------

/** Décale une date `YYYY-MM-DD` de `days` jours. */
export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Le lundi de la semaine contenant `date`, au format YYYY-MM-DD. */
export function weekStart(date: string): string {
  const d = new Date(`${date}T00:00:00Z`)
  // getUTCDay : 0 = dimanche. On ramène tout au lundi précédent.
  const offset = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - offset)
  return d.toISOString().slice(0, 10)
}

/** Index de semaine absolu depuis l'epoch, pour la rotation des boss. */
export function weekIndex(date: string): number {
  const monday = new Date(`${weekStart(date)}T00:00:00Z`)
  return Math.floor(monday.getTime() / (7 * 24 * 60 * 60 * 1000))
}

/** Liste les dates de `from` à `to` inclus. */
export function dateRange(from: string, to: string): string[] {
  const dates: string[] = []
  let cursor = from
  // Borne de sécurité : on ne construit jamais plus d'un an de dates.
  for (let i = 0; i < 366 && cursor <= to; i += 1) {
    dates.push(cursor)
    cursor = shiftDate(cursor, 1)
  }
  return dates
}

/** Date du jour au format YYYY-MM-DD, dans le fuseau local du navigateur. */
export function todayLocal(): string {
  const now = new Date()
  const offsetMs = now.getTimezoneOffset() * 60 * 1000
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10)
}
