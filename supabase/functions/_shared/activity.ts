import type { DailyActivity } from '../../../shared/game/types.ts'

/** Bornes de zones cardiaques, en fraction de la FC max (convention Fitbit). */
export const ZONE_THRESHOLDS = {
  fatBurn: 0.5,
  cardio: 0.7,
  peak: 0.85,
} as const

export interface ZoneMinutes {
  fatBurn: number
  cardio: number
  peak: number
  /** Estimation de la FC au repos (plus basse mesure de la journée). */
  restingEstimate: number
}

/** Journée vide, utilisée comme base avant remplissage par un provider. */
export function emptyActivity(date: string): DailyActivity {
  return {
    date,
    steps: 0,
    activeMinutes: 0,
    fatBurnMinutes: 0,
    cardioMinutes: 0,
    peakMinutes: 0,
    calories: 0,
    sleepMinutes: 0,
    restingHeartRate: 0,
  }
}

/**
 * Classe une suite de moyennes de FC en minutes par zone.
 *
 * Chaque mesure représente `minutesPerSample` minutes d'effort. Une tranche
 * entière tombe dans une seule zone : c'est une approximation, mais elle suit
 * fidèlement la charge cardiaque réelle sur des tranches courtes.
 */
export function classifyHeartRateZones(
  samples: number[],
  minutesPerSample: number,
  maxHeartRate: number,
): ZoneMinutes {
  const hrMax = Math.max(120, maxHeartRate)
  const zones: ZoneMinutes = { fatBurn: 0, cardio: 0, peak: 0, restingEstimate: 0 }

  let lowest = Number.POSITIVE_INFINITY

  for (const bpm of samples) {
    if (!Number.isFinite(bpm) || bpm <= 0) continue
    lowest = Math.min(lowest, bpm)

    const fraction = bpm / hrMax
    if (fraction >= ZONE_THRESHOLDS.peak) zones.peak += minutesPerSample
    else if (fraction >= ZONE_THRESHOLDS.cardio) zones.cardio += minutesPerSample
    else if (fraction >= ZONE_THRESHOLDS.fatBurn) zones.fatBurn += minutesPerSample
    // En dessous de 50 % de la FC max : hors zone, ça ne compte pas.
  }

  zones.restingEstimate = Number.isFinite(lowest) ? Math.round(lowest) : 0
  return zones
}
