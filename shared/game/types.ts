/**
 * Types du moteur de jeu, partagés entre le front (React) et le back
 * (Supabase Edge Functions, en Deno). Ce dossier ne doit contenir que du
 * TypeScript pur : pas d'import de React, de `node:` ni de dépendance npm.
 */

/** Fournisseur de données santé. */
export type HealthProvider = 'google_fit' | 'fitbit'

/** Classe de personnage. Chaque classe favorise un type d'effort différent. */
export type CharacterClass = 'ranger' | 'berserker' | 'paladin'

/** Activité brute d'un joueur sur une journée, normalisée entre providers. */
export interface DailyActivity {
  /** Date locale du joueur, au format YYYY-MM-DD. */
  date: string
  steps: number
  /** Minutes d'activité "modérée à intense" rapportées par le provider. */
  activeMinutes: number
  /** Minutes passées en zone cardiaque basse (fat burn / 50-69% FCmax). */
  fatBurnMinutes: number
  /** Minutes en zone cardio (70-84% FCmax). */
  cardioMinutes: number
  /** Minutes en zone peak (85%+ FCmax). */
  peakMinutes: number
  /** Calories actives brûlées (optionnel selon le provider). */
  calories: number
  /** Minutes de sommeil (optionnel). */
  sleepMinutes: number
  /** Fréquence cardiaque au repos, en bpm (optionnel, 0 si inconnue). */
  restingHeartRate: number
}

/** Objectifs personnels : c'est eux qui rendent le jeu équitable. */
export interface PlayerGoals {
  stepsGoal: number
  activeMinutesGoal: number
}

/** Contribution calculée d'un joueur pour une journée. */
export interface DailyContribution {
  date: string
  /** Ratio d'objectif de pas atteint, plafonné (1 = objectif pile atteint). */
  goalRatio: number
  /** XP gagnée par le personnage du joueur. */
  xp: number
  /** Dégâts infligés au boss de la semaine. */
  damage: number
  /** Points de marche apportés à la progression sur la carte. */
  marchPoints: number
  /** Le joueur a-t-il "participé" ce jour-là (seuil de présence) ? */
  participated: boolean
  /** Une vraie séance cardio a-t-elle eu lieu (déclenche l'attaque spéciale) ? */
  specialAttack: boolean
  /** Multiplicateur de série appliqué à l'XP. */
  streakMultiplier: number
}

/** État de progression d'un personnage. */
export interface CharacterState {
  level: number
  /** XP accumulée dans le niveau courant. */
  xp: number
  /** XP totale gagnée depuis la création (sert au classement). */
  totalXp: number
}

/** Résultat d'un gain d'XP : nouvel état + niveaux gagnés. */
export interface LevelUpResult extends CharacterState {
  levelsGained: number
}

/** États visuels du compagnon de guilde. */
export type CompanionMood = 'thriving' | 'healthy' | 'weak' | 'sick' | 'dormant'

/** Une région de la campagne. */
export interface CampaignRegion {
  key: string
  name: string
  /** Ordre de déblocage dans la campagne. */
  order: number
  /** Points de marche nécessaires *par membre* pour capturer la région. */
  marchPerMember: number
  biome: 'plains' | 'forest' | 'mountain' | 'swamp' | 'volcano' | 'tundra'
  /** Petit texte d'ambiance affiché sur la carte. */
  flavor: string
}

/** Statut d'un combat de boss hebdomadaire. */
export type BossStatus = 'active' | 'defeated' | 'failed'

/** Définition d'un boss (données statiques). */
export interface BossDefinition {
  key: string
  name: string
  sprite: string
  /** Multiplicateur de PV appliqué à la difficulté calculée pour la guilde. */
  hpMultiplier: number
  taunt: string
}
