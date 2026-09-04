import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { useGameState } from './api'
import type { GameState } from './api'
import { callFunction } from './supabase'

interface GameContextValue {
  state: GameState
  refresh: () => Promise<void>
  /** Déclenche une synchronisation santé puis recharge l'état. */
  sync: (days?: number) => Promise<void>
  syncing: boolean
  syncMessage: { tone: 'success' | 'error' | 'warning'; text: string } | null
  dismissSyncMessage: () => void
}

const GameContext = createContext<GameContextValue | null>(null)

interface SyncResponse {
  daysSynced: number
  providers: string[]
  errors: string[]
}

export function GameProvider({
  userId,
  children,
  fallback,
}: {
  userId: string
  children: (state: GameState) => ReactNode
  fallback: (props: { loading: boolean; error: string | null }) => ReactNode
}) {
  const { state, loading, error, refresh } = useGameState(userId)
  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<GameContextValue['syncMessage']>(null)

  const sync = useCallback(
    async (days = 7) => {
      setSyncing(true)
      setSyncMessage(null)
      try {
        const result = await callFunction<SyncResponse>('sync-health', { days })
        await refresh()

        if (result.errors.length > 0) {
          setSyncMessage({ tone: 'warning', text: result.errors.join(' · ') })
        } else if (result.providers.length === 0) {
          setSyncMessage({
            tone: 'warning',
            text: 'Aucun compte santé connecté. Va dans Réglages pour brancher Google Fit ou Fitbit.',
          })
        } else {
          setSyncMessage({
            tone: 'success',
            text: `${result.daysSynced} jour(s) synchronisé(s) depuis ${result.providers.join(' et ')}.`,
          })
        }
      } catch (err) {
        setSyncMessage({
          tone: 'error',
          text: err instanceof Error ? err.message : 'synchronisation impossible',
        })
      } finally {
        setSyncing(false)
      }
    },
    [refresh],
  )

  if (!state) {
    return <>{fallback({ loading, error })}</>
  }

  return (
    <GameContext.Provider
      value={{
        state,
        refresh,
        sync,
        syncing,
        syncMessage,
        dismissSyncMessage: () => setSyncMessage(null),
      }}
    >
      {children(state)}
    </GameContext.Provider>
  )
}

export function useGame(): GameContextValue {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame doit être utilisé dans un <GameProvider>')
  return context
}
