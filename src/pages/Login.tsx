import { useState } from 'react'
import { useAuth } from '../lib/auth'
import { Alert, Panel, Sprite } from '../components/ui'

export function Login() {
  const { signIn, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)

    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password, displayName.trim() || 'Aventurier')
        // Si la confirmation d'email est activée côté Supabase, la session
        // n'arrive pas tout de suite : on le dit plutôt que de laisser un écran figé.
        setNotice(
          'Compte créé. Si rien ne se passe, vérifie ta boîte mail : la confirmation est peut-être activée.',
        )
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connexion impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="hero">
        <div className="party">
          <Sprite src="/sprites/class-ranger.png" alt="" size={64} />
          <Sprite src="/sprites/class-berserker.png" alt="" size={64} />
          <Sprite src="/sprites/class-paladin.png" alt="" size={64} />
        </div>
        <h1>Guild Quest</h1>
        <p>
          Vos pas font avancer la guilde. Votre cardio fait tomber les boss. Votre régularité garde
          le compagnon en vie.
        </p>
      </div>

      <Panel>
        {error && <Alert tone="error">{error}</Alert>}
        {notice && <Alert tone="info">{notice}</Alert>}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="field">
              <label htmlFor="displayName">Pseudo</label>
              <input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Comment tes potes te connaissent"
                autoComplete="nickname"
              />
            </div>
          )}

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
            {mode === 'signup' && <div className="hint">6 caractères minimum.</div>}
          </div>

          <button type="submit" className="primary full" disabled={busy}>
            {busy ? '...' : mode === 'signup' ? 'Créer mon compte' : 'Entrer'}
          </button>
        </form>

        <p className="center small muted" style={{ marginTop: '1rem', marginBottom: 0 }}>
          {mode === 'signup' ? 'Déjà un compte ?' : 'Pas encore de compte ?'}{' '}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault()
              setMode(mode === 'signup' ? 'signin' : 'signup')
              setError(null)
              setNotice(null)
            }}
          >
            {mode === 'signup' ? 'Se connecter' : "S'inscrire"}
          </a>
        </p>
      </Panel>
    </div>
  )
}
