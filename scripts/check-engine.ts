/**
 * Contrôle de cohérence du moteur de jeu.
 *
 *   node --experimental-strip-types scripts/check-engine.ts
 *
 * Ne remplace pas une suite de tests, mais vérifie les invariants qui feraient
 * le plus mal s'ils cassaient : équité entre joueurs, dérivation du niveau,
 * calibrage du boss et bornes du compagnon.
 */
import {
  applyCompanionDelta,
  campaignProgress,
  companionDailyDelta,
  companionMood,
  computeBossHp,
  computeContribution,
  computeStreak,
  levelFromTotalXp,
  pickBoss,
  weekStart,
  xpToNextLevel,
} from '../shared/game/engine.ts'
import { BOSSES, RULES } from '../shared/game/rules.ts'
import type { DailyActivity, PlayerGoals } from '../shared/game/types.ts'

let failures = 0

function check(label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    failures += 1
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

function activity(partial: Partial<DailyActivity>): DailyActivity {
  return {
    date: '2026-09-01',
    steps: 0,
    activeMinutes: 0,
    fatBurnMinutes: 0,
    cardioMinutes: 0,
    peakMinutes: 0,
    calories: 0,
    sleepMinutes: 0,
    restingHeartRate: 0,
    ...partial,
  }
}

// ---------------------------------------------------------------------------
console.log('\nÉquité entre joueurs de niveaux différents')
// ---------------------------------------------------------------------------
{
  const sportif: PlayerGoals = { stepsGoal: 15000, activeMinutesGoal: 60 }
  const sedentaire: PlayerGoals = { stepsGoal: 4000, activeMinutesGoal: 15 }

  // Chacun atteint pile son objectif.
  const a = computeContribution(activity({ steps: 15000 }), sportif, 'ranger', 0)
  const b = computeContribution(activity({ steps: 4000 }), sedentaire, 'ranger', 0)

  check(
    'atteindre son objectif rapporte autant aux deux',
    a.marchPoints === b.marchPoints && a.xp === b.xp,
    `${a.marchPoints} vs ${b.marchPoints}`,
  )

  // Le plafond empêche un joueur d'écraser le groupe.
  const extreme = computeContribution(activity({ steps: 200000 }), sedentaire, 'ranger', 0)
  check(
    'le plafond limite la contribution à 2× l’objectif',
    extreme.goalRatio === RULES.MAX_GOAL_RATIO,
    `ratio=${extreme.goalRatio}`,
  )
  check(
    'un joueur extrême ne vaut pas plus de 2 joueurs réguliers',
    extreme.marchPoints <= b.marchPoints * 2,
    `${extreme.marchPoints} vs ${b.marchPoints * 2}`,
  )
}

// ---------------------------------------------------------------------------
console.log('\nDégâts et attaque spéciale')
// ---------------------------------------------------------------------------
{
  const goals: PlayerGoals = { stepsGoal: 8000, activeMinutesGoal: 30 }

  const marcheur = computeContribution(activity({ steps: 20000 }), goals, 'ranger', 0)
  check('marcher beaucoup n’inflige aucun dégât', marcheur.damage === 0, `${marcheur.damage}`)

  const court = computeContribution(activity({ cardioMinutes: 30 }), goals, 'ranger', 0)
  check('30 min de cardio infligent des dégâts', court.damage > 0, `${court.damage}`)
  check('l’attaque spéciale se déclenche au-delà du seuil', court.specialAttack)

  const petit = computeContribution(activity({ cardioMinutes: 5 }), goals, 'ranger', 0)
  check('5 min de cardio ne déclenchent pas l’attaque spéciale', !petit.specialAttack)

  const berserker = computeContribution(activity({ cardioMinutes: 30 }), goals, 'berserker', 0)
  check('le berserker frappe plus fort que le rôdeur', berserker.damage > court.damage)
}

// ---------------------------------------------------------------------------
console.log('\nProgression et niveaux')
// ---------------------------------------------------------------------------
{
  check('un nouveau personnage est niveau 1', levelFromTotalXp(0).level === 1)

  // La dérivation doit être exactement l'inverse de la courbe.
  let cumulative = 0
  for (let level = 1; level <= 20; level += 1) cumulative += xpToNextLevel(level)
  check(
    'la somme des paliers 1→21 donne bien le niveau 21',
    levelFromTotalXp(cumulative).level === 21,
    `obtenu ${levelFromTotalXp(cumulative).level}`,
  )
  check(
    'un XP de moins laisse au niveau 20',
    levelFromTotalXp(cumulative - 1).level === 20,
    `obtenu ${levelFromTotalXp(cumulative - 1).level}`,
  )

  // Rythme attendu : ~150 XP/jour pour un joueur régulier.
  const apresUnMois = levelFromTotalXp(150 * 30)
  check(
    'un mois de régularité mène entre le niveau 8 et 15',
    apresUnMois.level >= 8 && apresUnMois.level <= 15,
    `niveau ${apresUnMois.level}`,
  )
}

// ---------------------------------------------------------------------------
console.log('\nSéries')
// ---------------------------------------------------------------------------
{
  const history = [
    { date: '2026-08-30', participated: true },
    { date: '2026-08-31', participated: true },
    { date: '2026-09-01', participated: true },
  ]
  check('trois jours consécutifs font une série de 3', computeStreak(history, '2026-09-01') === 3)

  const trou = [
    { date: '2026-08-30', participated: true },
    { date: '2026-08-31', participated: false },
    { date: '2026-09-01', participated: true },
  ]
  check('un jour manqué casse la série', computeStreak(trou, '2026-09-01') === 1)

  check(
    'une journée en cours non validée ne casse pas la série',
    computeStreak(
      [
        { date: '2026-08-31', participated: true },
        { date: '2026-09-01', participated: false },
      ],
      '2026-09-01',
    ) === 1,
  )
}

// ---------------------------------------------------------------------------
console.log('\nCalibrage du boss')
// ---------------------------------------------------------------------------
{
  const boss = BOSSES[0]

  const nouvelleGuilde = computeBossHp(4, [], boss)
  check(
    'une guilde neuve retombe sur le plancher',
    nouvelleGuilde === 4 * RULES.BOSS_HP_FLOOR_PER_MEMBER,
    `${nouvelleGuilde}`,
  )

  // Une guilde qui inflige 8000/semaine doit affronter ~6800 PV.
  const rodee = computeBossHp(4, [8000, 8000, 8000, 8000], boss)
  check(
    'le boss vise 85 % des dégâts habituels',
    rodee === Math.round(8000 * RULES.BOSS_HP_TARGET_RATIO),
    `${rodee}`,
  )
  check('un boss calibré reste battable', rodee < 8000)

  check('la rotation des boss est déterministe', pickBoss(5).key === pickBoss(5).key)
  check(
    'la rotation couvre tous les boss',
    new Set([0, 1, 2, 3].map((i) => pickBoss(i).key)).size === BOSSES.length,
  )
}

// ---------------------------------------------------------------------------
console.log('\nCompagnon')
// ---------------------------------------------------------------------------
{
  check('une guilde assidue fait monter la vitalité', companionDailyDelta(1) > 0)
  check('une guilde inactive la fait baisser', companionDailyDelta(0) < 0)
  check('la vitalité ne dépasse jamais 100', applyCompanionDelta(98, 20) === 100)
  check('la vitalité ne descend jamais sous 0', applyCompanionDelta(2, -20) === 0)
  check('vitalité 0 = compagnon endormi', companionMood(0) === 'dormant')
  check('vitalité 100 = compagnon rayonnant', companionMood(100) === 'thriving')
}

// ---------------------------------------------------------------------------
console.log('\nCarte de campagne')
// ---------------------------------------------------------------------------
{
  const vide = campaignProgress(0, 4)
  check('sans marche, aucune région capturée', vide.every((entry) => !entry.captured))

  const premiere = campaignProgress(400 * 4, 4)
  check('la première région tombe au bon seuil', premiere[0].captured && !premiere[1].captured)

  const total = vide.reduce((sum, entry) => sum + entry.required, 0)
  const tout = campaignProgress(total, 4)
  check('assez de marche libère toute la campagne', tout.every((entry) => entry.captured))

  // Le coût augmente avec la taille : recruter ne raccourcit pas la campagne.
  const solo = campaignProgress(0, 1).reduce((sum, e) => sum + e.required, 0)
  const groupe = campaignProgress(0, 8).reduce((sum, e) => sum + e.required, 0)
  check('la campagne coûte plus cher à 8 qu’à 1', groupe === solo * 8)
}

// ---------------------------------------------------------------------------
console.log('\nDates')
// ---------------------------------------------------------------------------
{
  check('le lundi d’un mercredi est le lundi précédent', weekStart('2026-09-02') === '2026-08-31')
  check('le lundi d’un lundi est lui-même', weekStart('2026-08-31') === '2026-08-31')
  check('le lundi d’un dimanche est le lundi passé', weekStart('2026-09-06') === '2026-08-31')
}

console.log(
  failures === 0
    ? '\n✅ Tous les invariants sont respectés.\n'
    : `\n❌ ${failures} vérification(s) en échec.\n`,
)

process.exit(failures === 0 ? 0 : 1)
