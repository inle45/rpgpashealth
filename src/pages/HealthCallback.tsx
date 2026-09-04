import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { completeAuthorization, PROVIDER_LABELS } from '../lib/oauth'
import { Alert, Panel } from '../components/ui'

/**
 * Page d'atterrissage après l'écran de consentement Google ou Fitbit.
 * Elle échange le code puis renvoie vers les réglages.
 */
export function HealthCallback() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [status, setStatus] = useState<'working' | 'done' | 'error'>('working')
  const [message, setMessage] = useState('Connexion en cours...')

  // React 18 monte deux fois les effets en développement : sans ce garde, le
  // code d'autorisation serait échangé deux fois et le second appel échouerait.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true

    const error = params.get('error')
    const code = params.get('code')
    const state = params.get('state')

    if (error) {
      setStatus('error')
      setMessage(
        error === 'access_denied'
          ? "Autorisation refusée. Sans accès aux données, le jeu ne peut rien mesurer."
          : `Le provider a renvoyé une erreur : ${error}`,
      )
      return
    }

    if (!code || !state) {
      setStatus('error')
      setMessage('Réponse incomplète du provider (code ou state manquant).')
      return
    }

    completeAuthorization(code, state)
      .then(({ provider, warning }) => {
        setStatus('done')
        setMessage(
          warning ?? `${PROVIDER_LABELS[provider]} est connecté. Retour aux réglages...`,
        )
        if (!warning) {
          window.setTimeout(() => navigate('/reglages', { replace: true }), 1500)
        }
      })
      .catch((err: unknown) => {
        setStatus('error')
        setMessage(err instanceof Error ? err.message : 'échange du code impossible')
      })
  }, [params, navigate])

  return (
    <div className="auth-screen">
      <Panel title="Connexion santé">
        {status === 'working' && <p className="muted">{message}</p>}
        {status === 'done' && <Alert tone="success">{message}</Alert>}
        {status === 'error' && <Alert tone="error">{message}</Alert>}

        {status !== 'working' && (
          <button className="full" onClick={() => navigate('/reglages', { replace: true })}>
            Retour aux réglages
          </button>
        )}
      </Panel>
    </div>
  )
}
