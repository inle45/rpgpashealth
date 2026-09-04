import { BOSSES, RULES } from '@game/rules.ts'
import { todayLocal } from '@game/engine.ts'
import { useAuth } from '../lib/auth'
import { useGame } from '../lib/game-context'
import { Layout } from '../components/Layout'
import { Alert, formatNumber, Panel, Sprite, StatBar } from '../components/ui'

export function BossPage() {
  const { user } = useAuth()
  const { state } = useGame()
  const { boss, bossContributions, recentDays } = state

  if (!boss) {
    return (
      <Layout title="Boss de la semaine">
        <Panel>
          <Alert tone="info">
            Aucun boss n'est encore apparu. Il est créé à la première synchronisation de la semaine —
            lance une synchro depuis l'accueil.
          </Alert>
        </Panel>
      </Layout>
    )
  }

  const definition = BOSSES.find((entry) => entry.key === boss.boss_key)
  const percentRemaining = Math.round((boss.hp_remaining / Math.max(1, boss.max_hp)) * 100)
  const myDamage = bossContributions.find((entry) => entry.user_id === user?.id)?.damage ?? 0

  // On cible explicitement la journée en cours : la dernière ligne synchronisée
  // peut dater d'hier si la montre n'a rien remonté depuis.
  const todayRow = recentDays.find((row) => row.activity_date === todayLocal())
  const cardioToday = (todayRow?.cardio_minutes ?? 0) + (todayRow?.peak_minutes ?? 0)
  const minutesToSpecial = Math.max(0, RULES.SPECIAL_ATTACK_MINUTES - cardioToday)

  return (
    <Layout
      title={boss.boss_name}
      subtitle={`Semaine du ${formatDate(boss.week_start)}`}
    >
      <Panel>
        <div className="center">
          <div className="sprite-frame">
            <Sprite
              src={boss.sprite || '/sprites/boss-stone-golem.png'}
              alt={boss.boss_name}
              size={140}
              className="boss-sprite"
            />
          </div>
          {definition && (
            <p className="small muted" style={{ fontStyle: 'italic', margin: '0.5rem 0 1rem' }}>
              « {definition.taunt} »
            </p>
          )}
        </div>

        <StatBar
          name="Points de vie"
          value={boss.hp_remaining}
          max={boss.max_hp}
          tone="hp"
          display={`${formatNumber(boss.hp_remaining)} / ${formatNumber(boss.max_hp)} (${percentRemaining} %)`}
        />

        {boss.status === 'defeated' && (
          <Alert tone="success">
            🏆 Boss terrassé ! Le compagnon de la guilde gagne {RULES.COMPANION_BOSS_WIN_BONUS} points
            de vitalité.
          </Alert>
        )}
        {boss.status === 'failed' && (
          <Alert tone="error">
            Le boss a tenu la semaine. Le compagnon encaisse {Math.abs(RULES.COMPANION_BOSS_FAIL_MALUS)}{' '}
            points de vitalité en moins.
          </Alert>
        )}
        {boss.status === 'active' && (
          <Alert tone="info">
            Les dégâts viennent <strong>uniquement</strong> du temps passé en zone cardiaque :{' '}
            {RULES.DAMAGE_PER_FAT_BURN_MINUTE} pt/min en zone basse,{' '}
            {RULES.DAMAGE_PER_CARDIO_MINUTE} en zone cardio, {RULES.DAMAGE_PER_PEAK_MINUTE} en zone
            peak. Marcher ne suffit pas ici.
          </Alert>
        )}
      </Panel>

      <Panel title="Ta contribution">
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="value">{formatNumber(myDamage)}</span>
            <span className="label">Tes dégâts</span>
          </div>
          <div className="stat-tile">
            <span className="value">{cardioToday} min</span>
            <span className="label">Cardio aujourd'hui</span>
          </div>
        </div>

        {boss.status === 'active' && (
          <p className="small muted" style={{ marginTop: '0.85rem', marginBottom: 0 }}>
            {minutesToSpecial > 0
              ? `Encore ${minutesToSpecial} min en zone cardio aujourd'hui pour déclencher l'attaque spéciale (×${RULES.SPECIAL_ATTACK_MULTIPLIER} sur toute la journée).`
              : `Attaque spéciale déjà déclenchée aujourd'hui : tes dégâts du jour sont multipliés par ${RULES.SPECIAL_ATTACK_MULTIPLIER}.`}
          </p>
        )}
      </Panel>

      <Panel title="Dégâts par membre">
        <div className="roster">
          {bossContributions.map((entry, index) => (
            <div
              key={entry.user_id}
              className={`roster-row ${entry.user_id === user?.id ? 'self' : ''}`}
            >
              <span className="rank">{index + 1}</span>
              <div className="who">
                <div className="name">
                  {entry.display_name} {entry.landed_special ? '⚡' : ''}
                </div>
                <div className="meta">
                  {Math.round((entry.damage / Math.max(1, boss.max_hp)) * 100)} % des PV du boss
                </div>
              </div>
              <div className="score">{formatNumber(entry.damage)}</div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Comment le boss est calibré">
        <p className="small muted" style={{ margin: 0 }}>
          Ses points de vie valent {Math.round(RULES.BOSS_HP_TARGET_RATIO * 100)} % des dégâts que la
          guilde a infligés en moyenne les {RULES.BOSS_CALIBRATION_WEEKS} semaines précédentes. Il
          suit donc votre forme réelle : ni infaisable quand vous êtes cramés, ni trivial quand vous
          êtes à fond.
        </p>
      </Panel>
    </Layout>
  )
}

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })
}
