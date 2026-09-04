import { useState } from 'react'
import { xpToNextLevel } from '@game/engine.ts'
import { CLASS_BONUSES } from '@game/rules.ts'
import type { CharacterClass } from '@game/types.ts'
import { updateCharacter } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useGame } from '../lib/game-context'
import { Layout } from '../components/Layout'
import { Alert, formatNumber, Panel, Sprite, StatBar, StatTile } from '../components/ui'

const CLASSES = Object.keys(CLASS_BONUSES) as CharacterClass[]

export function CharacterPage() {
  const { user } = useAuth()
  const { state, refresh } = useGame()
  const { character, characterState, recentDays } = state

  const [name, setName] = useState(character?.name ?? '')
  const [selected, setSelected] = useState<CharacterClass>(character?.class ?? 'ranger')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  const totals = recentDays.reduce(
    (acc, row) => ({
      steps: acc.steps + row.steps,
      damage: acc.damage + row.damage_dealt,
      cardio: acc.cardio + row.cardio_minutes + row.peak_minutes,
      days: acc.days + (row.participated ? 1 : 0),
    }),
    { steps: 0, damage: 0, cardio: 0, days: 0 },
  )

  async function save() {
    if (!user) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateCharacter(user.id, { name: name.trim() || 'Sans-nom', class: selected })
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  const needed = xpToNextLevel(characterState.level)

  return (
    <Layout title="Ton personnage" subtitle={`Niveau ${characterState.level}`}>
      <Panel>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <div className="sprite-frame">
            <Sprite src={`/sprites/class-${selected}.png`} alt={CLASS_BONUSES[selected].label} size={92} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ color: 'var(--gold)', marginBottom: '0.5rem' }}>
              {character?.name ?? 'Sans-nom'}
            </h3>
            <StatBar
              name={`Niveau ${characterState.level}`}
              value={characterState.xp}
              max={needed}
              tone="xp"
              display={`${formatNumber(characterState.xp)} / ${formatNumber(needed)} XP`}
            />
            <p className="small muted" style={{ marginBottom: 0 }}>
              {formatNumber(characterState.totalXp)} XP au total
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="30 derniers jours">
        <div className="stat-grid">
          <StatTile value={formatNumber(totals.steps)} label="Pas" />
          <StatTile value={formatNumber(totals.damage)} label="Dégâts" />
          <StatTile value={`${totals.cardio} min`} label="Cardio" />
          <StatTile value={`${totals.days} j`} label="Jours actifs" />
        </div>
      </Panel>

      <Panel title="Identité">
        {error && <Alert tone="error">{error}</Alert>}
        {saved && <Alert tone="success">Personnage enregistré.</Alert>}

        <div className="field">
          <label htmlFor="charName">Nom du personnage</label>
          <input
            id="charName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            placeholder="Sans-nom"
          />
        </div>

        <label>Classe</label>
        <div className="class-picker">
          {CLASSES.map((key) => {
            const bonus = CLASS_BONUSES[key]
            return (
              <button
                key={key}
                type="button"
                className={`class-option ${selected === key ? 'selected' : ''}`}
                onClick={() => setSelected(key)}
                aria-pressed={selected === key}
              >
                <Sprite src={`/sprites/class-${key}.png`} alt="" size={48} />
                <div className="info">
                  <div className="name">{bonus.label}</div>
                  <div className="blurb">{bonus.blurb}</div>
                </div>
              </button>
            )
          })}
        </div>

        <p className="small muted" style={{ marginTop: '0.75rem' }}>
          Changer de classe n'affecte que les journées à venir : les contributions déjà calculées
          restent telles quelles.
        </p>

        <button className="primary full" onClick={() => void save()} disabled={busy}>
          {busy ? '...' : 'Enregistrer'}
        </button>
      </Panel>
    </Layout>
  )
}
