import type { BossDefinition, CampaignRegion, CharacterClass } from './types.ts'

/**
 * Constantes d'équilibrage. Tout ce qui se règle "au feeling" après quelques
 * semaines de jeu vit ici, pour éviter d'aller le chercher dans la logique.
 */
export const RULES = {
  /** Objectifs par défaut d'un nouveau joueur. */
  DEFAULT_STEPS_GOAL: 8000,
  DEFAULT_ACTIVE_MINUTES_GOAL: 30,

  /**
   * Plafond du ratio d'objectif. Sans ce plafond, celui qui fait 40 000 pas
   * écrase la contribution de tout le monde et le jeu n'a plus d'intérêt.
   */
  MAX_GOAL_RATIO: 2,

  /** XP pour un objectif de pas atteint pile (ratio = 1). */
  XP_PER_GOAL: 100,
  /** XP par minute d'activité modérée/intense. */
  XP_PER_ACTIVE_MINUTE: 2,

  /** Seuil de "participation" : moitié de son objectif perso. */
  PARTICIPATION_RATIO: 0.5,

  /** Bonus d'XP par jour de série, plafonné. */
  STREAK_BONUS_PER_DAY: 0.01,
  MAX_STREAK_DAYS: 30,

  /** Poids des zones cardiaques dans les dégâts au boss. */
  DAMAGE_PER_FAT_BURN_MINUTE: 1,
  DAMAGE_PER_CARDIO_MINUTE: 3,
  DAMAGE_PER_PEAK_MINUTE: 6,

  /**
   * Une vraie séance (>= 20 min en cardio+peak sur la journée) déclenche
   * l'attaque spéciale : de quoi récompenser l'effort intense ponctuel
   * autant que le volume.
   */
  SPECIAL_ATTACK_MINUTES: 20,
  SPECIAL_ATTACK_MULTIPLIER: 1.5,

  /** Points de marche pour un objectif de pas atteint pile. */
  MARCH_PER_GOAL: 100,

  /**
   * PV du boss : on vise ~85 % de ce que la guilde a infligé en moyenne les
   * semaines précédentes. Le boss se recalibre donc tout seul sur la forme
   * réelle du groupe, au lieu d'être infaisable ou trivial.
   */
  BOSS_HP_TARGET_RATIO: 0.85,
  /** PV plancher par membre, pour la toute première semaine d'une guilde. */
  BOSS_HP_FLOOR_PER_MEMBER: 600,
  /** Nombre de semaines passées utilisées pour calibrer le boss. */
  BOSS_CALIBRATION_WEEKS: 4,

  /** Vitalité du compagnon. */
  COMPANION_START_VITALITY: 70,
  COMPANION_MAX_VITALITY: 100,
  /** Variation quotidienne selon le taux de participation de la guilde. */
  COMPANION_DELTAS: [
    { minParticipation: 0.75, delta: 8 },
    { minParticipation: 0.5, delta: 3 },
    { minParticipation: 0.25, delta: -2 },
    { minParticipation: 0, delta: -6 },
  ],
  /** Bonus de vitalité quand la guilde tombe un boss. */
  COMPANION_BOSS_WIN_BONUS: 10,
  /** Malus quand le boss survit à la semaine. */
  COMPANION_BOSS_FAIL_MALUS: -12,
} as const

/** Bonus de classe : chaque classe convertit l'effort un peu différemment. */
export const CLASS_BONUSES: Record<
  CharacterClass,
  { label: string; xpMultiplier: number; damageMultiplier: number; marchMultiplier: number; blurb: string }
> = {
  ranger: {
    label: 'Rôdeur',
    xpMultiplier: 1,
    damageMultiplier: 0.9,
    marchMultiplier: 1.2,
    blurb: 'Fait avancer la guilde plus vite sur la carte. Pour les gros marcheurs.',
  },
  berserker: {
    label: 'Berserker',
    xpMultiplier: 1,
    damageMultiplier: 1.25,
    marchMultiplier: 0.9,
    blurb: 'Frappe plus fort au boss. Pour ceux qui vont chercher le cardio.',
  },
  paladin: {
    label: 'Paladin',
    xpMultiplier: 1.15,
    damageMultiplier: 1,
    marchMultiplier: 1,
    blurb: 'Monte en niveau plus vite. Pour la régularité au long cours.',
  },
}

/** La campagne : une suite de régions à libérer, de plus en plus exigeantes. */
export const CAMPAIGN: CampaignRegion[] = [
  {
    key: 'greenreach',
    name: 'Plaines de Verte-Portée',
    order: 1,
    marchPerMember: 400,
    biome: 'plains',
    flavor: "Les premières foulées. Le chemin est plat, les auberges sont chaudes.",
  },
  {
    key: 'oldwood',
    name: 'Bois-Ancien',
    order: 2,
    marchPerMember: 600,
    biome: 'forest',
    flavor: 'Sous la canopée, on perd vite le compte des heures et des pas.',
  },
  {
    key: 'stonepass',
    name: 'Col de Pierregarde',
    order: 3,
    marchPerMember: 900,
    biome: 'mountain',
    flavor: "L'air se raréfie. Chaque montée se paie comptant.",
  },
  {
    key: 'mirefen',
    name: 'Marais de Brumefange',
    order: 4,
    marchPerMember: 1100,
    biome: 'swamp',
    flavor: 'La boue avale les bottes et la motivation. Restez groupés.',
  },
  {
    key: 'frostwall',
    name: 'Mur de Givre',
    order: 5,
    marchPerMember: 1400,
    biome: 'tundra',
    flavor: 'Un vent qui coupe. On avance parce que s’arrêter est pire.',
  },
  {
    key: 'emberpeak',
    name: 'Pic-de-Braise',
    order: 6,
    marchPerMember: 1800,
    biome: 'volcano',
    flavor: 'Le sommet. Ce qui dort là-haut a entendu vos pas monter.',
  },
]

/** Les boss, tirés dans l'ordre au fil des semaines. */
export const BOSSES: BossDefinition[] = [
  {
    key: 'stone_golem',
    name: 'Golem de Pierre',
    sprite: '/sprites/boss-stone-golem.png',
    hpMultiplier: 1,
    taunt: "Vos pas résonnent creux. Je suis fait de la montagne elle-même.",
  },
  {
    key: 'frost_wyvern',
    name: 'Wyverne de Givre',
    sprite: '/sprites/boss-frost-wyvern.png',
    hpMultiplier: 1.15,
    taunt: 'Courez donc. Le froid court plus vite.',
  },
]
