import { useState } from 'react'
import { createGuild, joinGuild } from '../lib/api'
import { useAuth } from '../lib/auth'
import { Alert, Panel, Sprite } from '../components/ui'

/** Écran affiché tant que le joueur n'appartient à aucune guilde. */
export function Onboarding({ onJoined }: { onJoined: () => void }) {
  const { signOut } = useAuth()
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(action: () => Promise<unknown>) {
    setError(null)
    setBusy(true)
    try {
      await action()
      onJoined()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'opération impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="hero">
        <Sprite src="/sprites/companion-fox.png" alt="" size={92} className="companion" />
        <h1>Fonde ta guilde</h1>
        <p>
          Une guilde, c'est votre groupe de potes. Vous partagez un compagnon, une carte à conquérir
          et un boss par semaine.
        </p>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      <Panel title="Créer une guilde">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => createGuild(name.trim()))
          }}
        >
          <div className="field">
            <label htmlFor="guildName">Nom de la guilde</label>
            <input
              id="guildName"
              required
              minLength={2}
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Les Chevaliers du Canapé"
            />
            <div className="hint">
              Tu recevras un code à 6 caractères à envoyer à tes potes pour qu'ils te rejoignent.
            </div>
          </div>
          <button type="submit" className="primary full" disabled={busy || name.trim().length < 2}>
            Fonder
          </button>
        </form>
      </Panel>

      <Panel title="Rejoindre une guilde">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void run(() => joinGuild(code.trim().toUpperCase()))
          }}
        >
          <div className="field">
            <label htmlFor="inviteCode">Code d'invitation</label>
            <input
              id="inviteCode"
              required
              minLength={6}
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="A1B2C3"
              style={{ letterSpacing: '0.2em', textAlign: 'center' }}
            />
          </div>
          <button type="submit" className="full" disabled={busy || code.trim().length !== 6}>
            Rejoindre
          </button>
        </form>
      </Panel>

      <div className="center">
        <button className="ghost small" onClick={() => void signOut()}>
          Se déconnecter
        </button>
      </div>
    </div>
  )
}
