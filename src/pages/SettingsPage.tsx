import { useState } from 'react'
import type { HealthProvider } from '@game/types.ts'
import { disconnectProvider, updateProfile } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useGame } from '../lib/game-context'
import { isConfigured, PROVIDER_LABELS, startAuthorization } from '../lib/oauth'
import { Layout } from '../components/Layout'
import { Alert, Panel } from '../components/ui'

const PROVIDERS: HealthProvider[] = ['google_fit', 'fitbit']

export function SettingsPage() {
  const { user, signOut } = useAuth()
  const { state, refresh, sync, syncing } = useGame()
  const { profile, guild, connections } = state

  const [stepsGoal, setStepsGoal] = useState(String(profile.steps_goal))
  const [activeGoal, setActiveGoal] = useState(String(profile.active_minutes_goal))
  const [maxHr, setMaxHr] = useState(String(profile.max_heart_rate))
  const [displayName, setDisplayName] = useState(profile.display_name)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function saveProfile() {
    if (!user) return
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await updateProfile(user.id, {
        display_name: displayName.trim() || 'Aventurier',
        steps_goal: clamp(Number(stepsGoal), 1000, 50000),
        active_minutes_goal: clamp(Number(activeGoal), 5, 300),
        max_heart_rate: clamp(Number(maxHr), 120, 220),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      })
      await refresh()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'enregistrement impossible')
    } finally {
      setBusy(false)
    }
  }

  async function connect(provider: HealthProvider) {
    setError(null)
    try {
      await startAuthorization(provider)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connexion impossible')
    }
  }

  async function disconnect(connectionId: string) {
    setError(null)
    try {
      await disconnectProvider(connectionId)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'déconnexion impossible')
    }
  }

  return (
    <Layout title="Réglages">
      {error && <Alert tone="error">{error}</Alert>}

      <Panel title="Comptes santé">
        {PROVIDERS.map((provider) => {
          const connection = connections.find((entry) => entry.provider === provider)
          const configured = isConfigured(provider)

          return (
            <div
              key={provider}
              className={`provider-row ${connection ? 'connected' : ''}`}
            >
              <div className="info">
                <div className="name">{PROVIDER_LABELS[provider]}</div>
                <div className="status">
                  {!configured
                    ? 'Client ID absent du fichier .env'
                    : connection
                      ? connection.last_sync_error
                        ? `⚠ ${connection.last_sync_error}`
                        : connection.last_sync_at
                          ? `Dernière synchro ${formatDateTime(connection.last_sync_at)}`
                          : 'Connecté, pas encore synchronisé'
                      : 'Non connecté'}
                </div>
              </div>
              {connection ? (
                <button className="ghost small" onClick={() => void disconnect(connection.id)}>
                  Délier
                </button>
              ) : (
                <button
                  className="small"
                  disabled={!configured}
                  onClick={() => void connect(provider)}
                >
                  Connecter
                </button>
              )}
            </div>
          )
        })}

        <button
          className="primary full"
          style={{ marginTop: '0.5rem' }}
          onClick={() => void sync(30)}
          disabled={syncing || connections.length === 0}
        >
          {syncing ? '...' : 'Resynchroniser 30 jours'}
        </button>

        <p className="small muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          Si tu connectes les deux, les données sont fusionnées en gardant la plus haute valeur de
          chaque métrique — pas de double comptage entre la montre et le téléphone.
        </p>
      </Panel>

      <Panel title="Objectifs personnels">
        {saved && <Alert tone="success">Réglages enregistrés.</Alert>}

        <div className="field">
          <label htmlFor="displayName">Pseudo</label>
          <input
            id="displayName"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
          />
        </div>

        <div className="field">
          <label htmlFor="stepsGoal">Objectif de pas par jour</label>
          <input
            id="stepsGoal"
            type="number"
            min={1000}
            max={50000}
            step={500}
            value={stepsGoal}
            onChange={(e) => setStepsGoal(e.target.value)}
          />
          <div className="hint">
            Tout est calculé en pourcentage de <em>ton</em> objectif : un pote qui marche moins peut
            contribuer autant que toi en atteignant le sien.
          </div>
        </div>

        <div className="field">
          <label htmlFor="activeGoal">Objectif de minutes actives</label>
          <input
            id="activeGoal"
            type="number"
            min={5}
            max={300}
            step={5}
            value={activeGoal}
            onChange={(e) => setActiveGoal(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="maxHr">Fréquence cardiaque maximale</label>
          <input
            id="maxHr"
            type="number"
            min={120}
            max={220}
            value={maxHr}
            onChange={(e) => setMaxHr(e.target.value)}
          />
          <div className="hint">
            Sert à découper les zones cardiaques (50 / 70 / 85 %) sur les données Google Fit. Estime-la
            avec 220 − ton âge, ou mets ta vraie FC max si tu la connais. Fitbit fournit ses propres
            zones et ignore ce réglage.
          </div>
        </div>

        <button className="primary full" onClick={() => void saveProfile()} disabled={busy}>
          {busy ? '...' : 'Enregistrer'}
        </button>
      </Panel>

      {guild && (
        <Panel title="Guilde">
          <p className="small muted">
            Envoie ce code à tes potes pour qu'ils rejoignent <strong>{guild.name}</strong> :
          </p>
          <div className="invite-code">{guild.invite_code}</div>
        </Panel>
      )}

      <Panel>
        <div className="center small muted" style={{ marginBottom: '0.75rem' }}>
          Connecté en tant que {user?.email}
        </div>
        <button className="ghost full" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </Panel>
    </Layout>
  )
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}
