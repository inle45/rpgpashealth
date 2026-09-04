import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { GameProvider, useGame } from './lib/game-context'
import { Login } from './pages/Login'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { BossPage } from './pages/BossPage'
import { MapPage } from './pages/MapPage'
import { CharacterPage } from './pages/CharacterPage'
import { SettingsPage } from './pages/SettingsPage'
import { HealthCallback } from './pages/HealthCallback'
import { Alert, Panel } from './components/ui'

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Le retour OAuth doit rester joignable même sans guilde. */}
          <Route path="/auth/health-callback" element={<RequireAuth><HealthCallback /></RequireAuth>} />
          <Route path="/*" element={<AuthenticatedApp />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Login />
  return <>{children}</>
}

function AuthenticatedApp() {
  const { session, loading, user } = useAuth()

  if (loading) return <LoadingScreen />
  if (!session || !user) return <Login />

  return (
    <GameProvider
      userId={user.id}
      fallback={({ loading: stateLoading, error }) =>
        stateLoading ? <LoadingScreen /> : <LoadError message={error} />
      }
    >
      {(state) =>
        state.guild ? (
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/boss" element={<BossPage />} />
            <Route path="/carte" element={<MapPage />} />
            <Route path="/perso" element={<CharacterPage />} />
            <Route path="/reglages" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <GuildlessRoutes />
        )
      }
    </GameProvider>
  )
}

/**
 * Sans guilde, le jeu n'a pas de sens (compagnon, boss et carte sont
 * collectifs) : on redirige tout vers l'écran de création/adhésion.
 */
function GuildlessRoutes() {
  const { refresh } = useGame()
  return (
    <Routes>
      <Route path="*" element={<Onboarding onJoined={() => void refresh()} />} />
    </Routes>
  )
}

function LoadingScreen() {
  return <div className="loading-screen">Chargement...</div>
}

function LoadError({ message }: { message: string | null }) {
  return (
    <div className="auth-screen">
      <Panel title="Erreur de chargement">
        <Alert tone="error">{message ?? 'état de jeu indisponible'}</Alert>
        <button className="full" onClick={() => window.location.reload()}>
          Réessayer
        </button>
      </Panel>
    </div>
  )
}
