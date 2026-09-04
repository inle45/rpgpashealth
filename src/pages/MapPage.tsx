import { campaignProgress } from '@game/engine.ts'
import type { CampaignRegion } from '@game/types.ts'
import { useGame } from '../lib/game-context'
import { Layout } from '../components/Layout'
import { formatNumber, Panel, StatBar } from '../components/ui'

const BIOME_ICONS: Record<CampaignRegion['biome'], string> = {
  plains: '🌾',
  forest: '🌲',
  mountain: '⛰️',
  swamp: '🪵',
  tundra: '❄️',
  volcano: '🌋',
}

export function MapPage() {
  const { state } = useGame()
  const { totals, members } = state

  const memberCount = totals?.member_count ?? Math.max(1, members.length)
  const totalMarch = Number(totals?.total_march ?? 0)
  const progress = campaignProgress(totalMarch, memberCount)

  const capturedCount = progress.filter((entry) => entry.captured).length
  const currentIndex = progress.findIndex((entry) => !entry.captured)

  return (
    <Layout
      title="Carte de campagne"
      subtitle={`${capturedCount} / ${progress.length} régions libérées`}
    >
      <Panel title="Progression collective">
        <StatBar
          name="Points de marche"
          value={totalMarch}
          max={progress.reduce((sum, entry) => sum + entry.required, 0)}
          tone="march"
          display={formatNumber(totalMarch)}
        />
        <p className="small muted" style={{ marginTop: '0.6rem', marginBottom: 0 }}>
          Chaque objectif de pas atteint rapporte 100 points de marche à la guilde. Les régions
          exigent d'autant plus de points que vous êtes nombreux — pas de raccourci en recrutant.
        </p>
      </Panel>

      {progress.map((entry, index) => {
        const isCurrent = index === currentIndex
        const percent = Math.round((entry.progress / entry.required) * 100)

        return (
          <div
            key={entry.region.key}
            className={`region ${entry.captured || isCurrent ? 'reached' : ''} ${
              isCurrent ? 'current' : ''
            }`}
          >
            <div className={`marker ${entry.region.biome}`} aria-hidden="true">
              {entry.captured ? '🚩' : BIOME_ICONS[entry.region.biome]}
            </div>
            <div className="body">
              <div className="name">{entry.region.name}</div>
              <div className="flavor">{entry.region.flavor}</div>
              <StatBar
                name={entry.captured ? 'Libérée' : isCurrent ? 'En cours' : 'Verrouillée'}
                value={entry.progress}
                max={entry.required}
                tone={entry.captured ? 'gold' : 'march'}
                display={`${formatNumber(entry.progress)} / ${formatNumber(entry.required)} (${percent} %)`}
              />
            </div>
          </div>
        )
      })}
    </Layout>
  )
}
