import { COMPANION_MOOD_LABELS, companionMood, computeStreak, todayLocal } from '@game/engine.ts'
import { RULES } from '@game/rules.ts'
import { useAuth } from '../lib/auth'
import { useGame } from '../lib/game-context'
import { Layout } from '../components/Layout'
import { Alert, formatNumber, Panel, Sparkline, Sprite, StatBar, StatTile } from '../components/ui'

export function Dashboard() {
  const { user } = useAuth()
  const { state, sync, syncing, syncMessage, dismissSyncMessage } = useGame()
  const { profile, guild, members, recentDays } = state

  const today = todayLocal()
  const todayRow = recentDays.find((row) => row.activity_date === today)
  const steps = todayRow?.steps ?? 0
  const cardioMinutes = (todayRow?.cardio_minutes ?? 0) + (todayRow?.peak_minutes ?? 0)

  const streak = computeStreak(
    recentDays.map((row) => ({ date: row.activity_date, participated: row.participated })),
    today,
  )

  const vitality = guild?.companion_vitality ?? RULES.COMPANION_START_VITALITY
  const mood = companionMood(vitality)

  // Sept derniers jours, en complétant les trous : une journée sans donnée
  // doit apparaître comme une barre vide, pas disparaître du graphe.
  const lastWeek = buildWeek(recentDays, today)

  return (
    <Layout
      title={guild?.name ?? 'Guild Quest'}
      subtitle={`${members.length} membre${members.length > 1 ? 's' : ''} · série de ${streak} jour${streak > 1 ? 's' : ''}`}
      action={
        <button className="small" onClick={() => void sync()} disabled={syncing}>
          {syncing ? '...' : '↻ Synchro'}
        </button>
      }
    >
      {syncMessage && (
        <div onClick={dismissSyncMessage}>
          <Alert tone={syncMessage.tone}>{syncMessage.text}</Alert>
        </div>
      )}

      <Panel title="Ta journée">
        <StatBar
          name="Pas"
          value={steps}
          max={profile.steps_goal}
          tone="march"
          display={`${formatNumber(steps)} / ${formatNumber(profile.steps_goal)}`}
        />
        <StatBar
          name="Zone cardio"
          value={cardioMinutes}
          max={RULES.SPECIAL_ATTACK_MINUTES}
          tone="cardio"
          display={`${cardioMinutes} min`}
        />

        <div className="stat-grid" style={{ marginTop: '0.85rem' }}>
          <StatTile value={formatNumber(todayRow?.xp_awarded ?? 0)} label="XP du jour" />
          <StatTile value={formatNumber(todayRow?.damage_dealt ?? 0)} label="Dégâts" />
          <StatTile value={`${streak}j`} label="Série" />
        </div>

        {todayRow?.special_attack && (
          <div style={{ marginTop: '0.85rem' }}>
            <Alert tone="success">
              ⚡ Attaque spéciale déclenchée : {RULES.SPECIAL_ATTACK_MINUTES} min de cardio ou plus,
              dégâts ×{RULES.SPECIAL_ATTACK_MULTIPLIER}.
            </Alert>
          </div>
        )}
      </Panel>

      <Panel title="7 derniers jours">
        <Sparkline
          values={lastWeek.map((row) => row.steps)}
          goal={profile.steps_goal}
          labels={['il y a 7 j', "aujourd'hui"]}
        />
        <p className="small muted" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
          En vert, les jours où tu as atteint ton objectif de {formatNumber(profile.steps_goal)} pas.
        </p>
      </Panel>

      {guild && (
        <Panel title={`Compagnon · ${guild.companion_name}`}>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className="sprite-frame">
              <Sprite
                src="/sprites/companion-fox.png"
                alt={guild.companion_name}
                size={92}
                className={`companion mood-${mood}`}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <StatBar
                name="Vitalité"
                value={vitality}
                max={100}
                tone="gold"
                display={`${vitality} · ${COMPANION_MOOD_LABELS[mood]}`}
              />
              <p className="small muted" style={{ marginBottom: 0 }}>
                {companionAdvice(mood)}
              </p>
            </div>
          </div>
        </Panel>
      )}

      <Panel title="Classement de la guilde">
        <div className="roster">
          {members.length === 0 && (
            <p className="muted small">
              Personne n'a encore synchronisé de données. Lance une synchro pour ouvrir le bal.
            </p>
          )}
          {members.map((member, index) => (
            <div
              key={member.user_id}
              className={`roster-row ${member.user_id === user?.id ? 'self' : ''}`}
            >
              <span className="rank">{index + 1}</span>
              <Sprite
                src={`/sprites/class-${member.character_class ?? 'ranger'}.png`}
                alt=""
                size={40}
              />
              <div className="who">
                <div className="name">{member.display_name}</div>
                <div className="meta">
                  {formatNumber(member.total_steps)} pas · {member.active_days} jours actifs
                </div>
              </div>
              <div className="score">{formatNumber(member.total_xp)} XP</div>
            </div>
          ))}
        </div>
      </Panel>
    </Layout>
  )
}

/** Complète les 7 derniers jours pour que les trous restent visibles. */
function buildWeek(
  rows: { activity_date: string; steps: number }[],
  today: string,
): { date: string; steps: number }[] {
  const byDate = new Map(rows.map((row) => [row.activity_date, row.steps]))
  const week: { date: string; steps: number }[] = []

  const cursor = new Date(`${today}T00:00:00Z`)
  cursor.setUTCDate(cursor.getUTCDate() - 6)

  for (let i = 0; i < 7; i += 1) {
    const date = cursor.toISOString().slice(0, 10)
    week.push({ date, steps: byDate.get(date) ?? 0 })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return week
}

function companionAdvice(mood: ReturnType<typeof companionMood>): string {
  switch (mood) {
    case 'thriving':
      return 'La guilde tient le rythme. Il rayonne.'
    case 'healthy':
      return 'Tout va bien. Continuez comme ça.'
    case 'weak':
      return 'Il fatigue : trop peu de monde bouge ces jours-ci.'
    case 'sick':
      return 'Il ne tient plus debout. Il faudrait que le groupe s’y remette.'
    case 'dormant':
      return "Il s'est endormi. Quelques jours actifs le réveilleront."
  }
}
