import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react'
import { readableError, useAuth } from '../backend/AuthContext'
import { advanceGame, createInitialGame } from '../game/engine'
import { gameReducer } from '../game/reducer'
import {
  loadGame,
  loadRemoteGame,
  saveGame,
  saveRemoteGame,
} from '../game/storage'
import type { GameAction, GameState } from '../types/game'

export type GameSyncStatus = 'local' | 'loading' | 'synced' | 'syncing' | 'error'

interface GameContextValue {
  state: GameState
  now: number
  dispatch: (action: GameAction) => void
  syncStatus: GameSyncStatus
  syncMessage: string | null
  retrySync: () => Promise<void>
}

const GameContext = createContext<GameContextValue | null>(null)

const initializeGame = (playerId?: string) => {
  const now = Date.now()
  const saved = playerId ? loadRemoteGame(playerId) : loadGame()
  return saved ? advanceGame(saved, now) : createInitialGame(now)
}

export const GameProvider = ({ children }: PropsWithChildren) => {
  const auth = useAuth()
  const playerId = auth.session?.user.id
  const [state, setState] = useState(() => initializeGame(playerId))
  const [now, setNow] = useState(Date.now())
  const [syncStatus, setSyncStatus] = useState<GameSyncStatus>(
    auth.status === 'authenticated' ? 'loading' : 'local',
  )
  const [syncMessage, setSyncMessage] = useState<string | null>(null)
  const remoteAvailableRef = useRef(auth.status === 'authenticated')
  const actionQueueRef = useRef<Promise<void>>(Promise.resolve())

  const cacheState = useCallback((nextState: GameState) => {
    if (playerId) saveRemoteGame(nextState, playerId)
    else saveGame(nextState)
  }, [playerId])

  const applyRemoteState = useCallback((nextState: GameState) => {
    setState(nextState)
    cacheState(nextState)
    remoteAvailableRef.current = true
    setSyncStatus('synced')
    setSyncMessage(null)
  }, [cacheState])

  const retrySync = useCallback(async () => {
    if (auth.status !== 'authenticated') return
    setSyncStatus('loading')
    setSyncMessage('La partie serveur va remplacer le cache local non synchronisé.')
    try {
      applyRemoteState(await auth.getRemoteGame())
    } catch (error) {
      remoteAvailableRef.current = false
      setSyncStatus('error')
      setSyncMessage(`${readableError(error)} La progression reste dans le cache local.`)
    }
  }, [auth, applyRemoteState])

  useEffect(() => {
    if (auth.status !== 'authenticated') {
      remoteAvailableRef.current = false
      setSyncStatus('local')
      setSyncMessage(null)
      return
    }

    let active = true
    setSyncStatus('loading')
    const hydrate = async () => {
      try {
        const remoteState = await auth.getRemoteGame()
        if (active) applyRemoteState(remoteState)
      } catch (error) {
        if (!active) return
        remoteAvailableRef.current = false
        setSyncStatus('error')
        setSyncMessage(
          `${readableError(error)} Les actions restent locales ; recharger le serveur remplacera ce cache.`,
        )
      }
    }
    void hydrate()
    return () => {
      active = false
    }
  }, [auth.status, playerId, auth.getRemoteGame, applyRemoteState])

  const dispatch = useCallback((action: GameAction) => {
    if (auth.status !== 'authenticated' || !remoteAvailableRef.current) {
      setState((currentState) => gameReducer(currentState, action))
      return
    }

    actionQueueRef.current = actionQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (!remoteAvailableRef.current) {
          setState((currentState) => gameReducer(currentState, action))
          return
        }
        setSyncStatus('syncing')
        try {
          applyRemoteState(
            action.type === 'TICK'
              ? await auth.getRemoteGame()
              : await auth.sendRemoteAction(action),
          )
        } catch (error) {
          remoteAvailableRef.current = false
          setState((currentState) => gameReducer(currentState, action))
          setSyncStatus('error')
          setSyncMessage(
            `${readableError(error)} Cette action a été appliquée au cache local uniquement.`,
          )
        }
      })
  }, [auth.status, auth.getRemoteGame, auth.sendRemoteAction, applyRemoteState])

  useEffect(() => {
    const timeout = window.setTimeout(() => cacheState(state), 180)
    return () => window.clearTimeout(timeout)
  }, [state, cacheState])

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentTime = Date.now()
      setNow(currentTime)
      if (auth.status !== 'authenticated' || !remoteAvailableRef.current) {
        setState((currentState) => gameReducer(currentState, { type: 'TICK', now: currentTime }))
      }
    }, 1_000)
    return () => window.clearInterval(interval)
  }, [auth.status])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    const interval = window.setInterval(() => {
      if (remoteAvailableRef.current) dispatch({ type: 'TICK', now: Date.now() })
    }, 4_000)
    return () => window.clearInterval(interval)
  }, [auth.status, dispatch])

  const value = useMemo(() => ({
    state,
    now,
    dispatch,
    syncStatus,
    syncMessage,
    retrySync,
  }), [state, now, dispatch, syncStatus, syncMessage, retrySync])
  return <GameContext.Provider value={value}>{children}</GameContext.Provider>
}

export const useGame = () => {
  const context = useContext(GameContext)
  if (!context) throw new Error('useGame doit être utilisé dans GameProvider')
  return context
}
