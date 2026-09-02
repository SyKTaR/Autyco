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
import {
  SupabaseRequestError,
  closePrivateServer,
  createPrivateServer,
  createPlayerIdentity,
  fetchAuthUser,
  fetchCurrentPrivateServer,
  fetchExistingPlayerIdentity,
  fetchPlayerIdentity,
  fetchPrivateServerLeaderboard,
  fetchRemoteGame,
  joinPrivateServer,
  leavePrivateServer,
  loadStoredSession,
  loadSupabaseConfiguration,
  performRemoteGameAction,
  recoverPlayer,
  recoverSessionFromUrl,
  refreshAuthSession,
  requestRecoveryEmailOtp,
  rotatePlayerRecoveryCode,
  rotatePrivateServerInvite,
  signInAnonymously,
  signOutSession,
  storeSession,
  updateRecoveryEmail,
  verifyRecoveryEmailOtp,
  type AuthSession,
  type PlayerIdentity,
  type PrivateServerLeaderboard,
  type PrivateServerMutation,
  type PrivateServerSummary,
} from './supabase'
import {
  clearStoredRecoveryCode,
  issueAndStoreRecoveryCode,
  loadStoredRecoveryCode,
  storeRecoveryCode,
} from './recoveryCodeStorage'
import type { GameAction, GameState } from '../types/game'

export type AuthStatus =
  | 'initializing'
  | 'signed-out'
  | 'recovery-code'
  | 'authenticated'
  | 'local'

export type SetupKind = 'created' | 'restored'

interface AuthContextValue {
  status: AuthStatus
  configured: boolean
  session: AuthSession | null
  identity: PlayerIdentity | null
  recoveryCode: string | null
  setupKind: SetupKind | null
  notice: string | null
  createPlayer: (garageName: string, playerName: string) => Promise<void>
  restorePlayer: (recoveryCode: string) => Promise<void>
  linkRecoveryEmail: (email: string) => Promise<void>
  refreshRecoveryEmail: () => Promise<void>
  requestEmailLogin: (email: string) => Promise<void>
  verifyEmailLogin: (email: string, token: string) => Promise<void>
  completeSetup: () => void
  getRecoveryCode: () => Promise<string | null>
  rotateRecoveryCode: () => Promise<string>
  signOut: () => Promise<void>
  useLocalMode: (reason?: string) => void
  showEntry: () => void
  getRemoteGame: () => Promise<GameState>
  sendRemoteAction: (action: GameAction) => Promise<GameState>
  getCurrentPrivateServer: () => Promise<PrivateServerSummary | null>
  createPrivateServer: (name: string, replaceCurrent?: boolean) => Promise<PrivateServerMutation>
  joinPrivateServer: (inviteCode: string, replaceCurrent?: boolean) => Promise<PrivateServerMutation>
  rotatePrivateServerInvite: () => Promise<string>
  leavePrivateServer: () => Promise<void>
  closePrivateServer: (serverId: string) => Promise<void>
  getPrivateServerLeaderboard: () => Promise<PrivateServerLeaderboard>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const readableError = (error: unknown) =>
  error instanceof Error ? error.message : 'Une erreur inattendue est survenue.'

const emailRedirectTo = () =>
  typeof window === 'undefined' ? undefined : `${window.location.origin}${window.location.pathname}`

const hasAuthCallback = (url: URL) => {
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  return fragment.has('access_token')
    || fragment.has('error_description')
    || url.searchParams.has('token_hash')
}

const clearAuthCallback = (url: URL) => {
  if (typeof window === 'undefined' || !hasAuthCallback(url)) return
  const cleanedUrl = new URL(url)
  cleanedUrl.hash = ''
  cleanedUrl.searchParams.delete('token_hash')
  cleanedUrl.searchParams.delete('type')
  window.history.replaceState(null, '', `${cleanedUrl.pathname}${cleanedUrl.search}`)
}

export const AuthProvider = ({ children }: PropsWithChildren) => {
  const configuration = useMemo(loadSupabaseConfiguration, [])
  const [status, setStatus] = useState<AuthStatus>('initializing')
  const [session, setSession] = useState<AuthSession | null>(null)
  const [identity, setIdentity] = useState<PlayerIdentity | null>(null)
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null)
  const [setupKind, setSetupKind] = useState<SetupKind | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const sessionRef = useRef<AuthSession | null>(null)
  const initializationRef = useRef<Promise<{
    session: AuthSession
    fromEmail: boolean
    callbackFailed: boolean
  }> | null>(null)
  const initializationFromEmailRef = useRef(false)
  const recoverySessionRef = useRef<AuthSession | null>(null)

  const updateSession = useCallback((nextSession: AuthSession | null) => {
    sessionRef.current = nextSession
    setSession(nextSession)
    storeSession(nextSession)
  }, [])

  useEffect(() => {
    let active = true
    const initialize = async () => {
      if (!configuration) {
        if (!active) return
        setNotice('Supabase n’est pas configuré : la partie reste enregistrée sur cet appareil.')
        setStatus('local')
        return
      }

      const storedSession = loadStoredSession()
      const callbackUrl = typeof window === 'undefined' ? null : new URL(window.location.href)
      const authCallback = callbackUrl ? hasAuthCallback(callbackUrl) : false
      const initializationPending = Boolean(initializationRef.current)
      if (!storedSession && !authCallback && !initializationPending) {
        if (active) setStatus('signed-out')
        return
      }

      try {
        if (authCallback) initializationFromEmailRef.current = true
        if (callbackUrl && authCallback) clearAuthCallback(callbackUrl)
        initializationRef.current ??= (async () => {
          let callbackFailed = false
          if (callbackUrl && authCallback) {
            try {
              const redirectedSession = await recoverSessionFromUrl(configuration, callbackUrl)
              if (redirectedSession) {
                return { session: redirectedSession, fromEmail: true, callbackFailed: false }
              }
            } catch {
              callbackFailed = true
            }
          }
          if (storedSession) {
            return {
              session: await refreshAuthSession(configuration, storedSession.refreshToken),
              fromEmail: false,
              callbackFailed,
            }
          }
          throw new SupabaseRequestError('Ce lien email est invalide ou expiré.', 401)
        })()
        const initialized = await initializationRef.current
        const storedIdentity = await (
          initialized.fromEmail ? fetchExistingPlayerIdentity : fetchPlayerIdentity
        )(configuration, initialized.session)
        if (!active) return
        updateSession(initialized.session)
        setIdentity(storedIdentity)
        setRecoveryCode(loadStoredRecoveryCode(initialized.session.user.id))
        setNotice(
          initialized.fromEmail
            ? 'Connexion par email réussie.'
            : initialized.callbackFailed
              ? 'Le lien email n’a pas pu être validé. Ta session locale reste active.'
              : null,
        )
        setStatus('authenticated')
      } catch (error) {
        if (!active) return
        if (error instanceof SupabaseRequestError && error.status === 0 && storedSession) {
          sessionRef.current = storedSession
          setSession(storedSession)
          setRecoveryCode(loadStoredRecoveryCode(storedSession.user.id))
          setNotice('Supabase est temporairement injoignable. La partie locale reste disponible.')
          setStatus('local')
        } else {
          updateSession(null)
          setIdentity(null)
          setNotice(
            initializationFromEmailRef.current
              ? 'Ce lien email est invalide ou expiré. Demande un nouvel envoi.'
              : 'Cette session n’est plus active. Restaure ta partie avec ton code ou ton email.',
          )
          setStatus('signed-out')
        }
      }
    }
    void initialize()
    return () => {
      active = false
    }
  }, [configuration, updateSession])

  const discardTemporarySession = useCallback(async (temporarySession: AuthSession) => {
    if (!configuration) return
    try {
      await signOutSession(configuration, temporarySession)
    } catch {
      // La session incomplète n'est jamais persistée : l'échec de révocation reste sans effet local.
    }
  }, [configuration])

  const createPlayer = useCallback(async (garageName: string, playerName: string) => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    if (recoverySessionRef.current) {
      await discardTemporarySession(recoverySessionRef.current)
      recoverySessionRef.current = null
    }
    const temporarySession = await signInAnonymously(configuration, garageName, playerName)
    try {
      const createdIdentity = await createPlayerIdentity(
        configuration,
        temporarySession,
        garageName,
        playerName,
      )
      updateSession(temporarySession)
      setIdentity({
        garageName: createdIdentity.garageName,
        playerName: createdIdentity.playerName,
      })
      storeRecoveryCode(temporarySession.user.id, createdIdentity.recoveryCode)
      setRecoveryCode(createdIdentity.recoveryCode)
      setSetupKind('created')
      setNotice(null)
      setStatus('recovery-code')
    } catch (error) {
      await discardTemporarySession(temporarySession)
      throw error
    }
  }, [configuration, discardTemporarySession, updateSession])

  const restorePlayer = useCallback(async (code: string) => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    const temporarySession = recoverySessionRef.current
      ?? await signInAnonymously(configuration)
    recoverySessionRef.current = temporarySession
    try {
      const restoredIdentity = await recoverPlayer(configuration, temporarySession, code)
      recoverySessionRef.current = null
      updateSession(temporarySession)
      setIdentity({
        garageName: restoredIdentity.garageName,
        playerName: restoredIdentity.playerName,
      })
      storeRecoveryCode(temporarySession.user.id, restoredIdentity.recoveryCode)
      setRecoveryCode(restoredIdentity.recoveryCode)
      setSetupKind('restored')
      setNotice(null)
      setStatus('recovery-code')
    } catch (error) {
      if (error instanceof SupabaseRequestError && error.status === 401) {
        recoverySessionRef.current = null
        await discardTemporarySession(temporarySession)
      }
      throw error
    }
  }, [configuration, discardTemporarySession, updateSession])

  const completeSetup = useCallback(() => {
    setSetupKind(null)
    setStatus('authenticated')
  }, [])

  const signOut = useCallback(async () => {
    const currentSession = sessionRef.current
    const temporaryRecoverySession = recoverySessionRef.current
    recoverySessionRef.current = null
    setNotice(null)
    if (configuration && currentSession) {
      try {
        await signOutSession(configuration, currentSession)
      } catch (error) {
        setNotice(
          `${readableError(error)} La session a tout de même été supprimée de cet appareil.`,
        )
      }
    }
    if (temporaryRecoverySession) {
      await discardTemporarySession(temporaryRecoverySession)
    }
    if (currentSession) clearStoredRecoveryCode(currentSession.user.id)
    updateSession(null)
    setIdentity(null)
    setRecoveryCode(null)
    setSetupKind(null)
    setStatus(configuration ? 'signed-out' : 'local')
  }, [configuration, discardTemporarySession, updateSession])

  const useLocalMode = useCallback((reason?: string) => {
    setNotice(reason ?? 'Mode local actif. Cette progression reste sur cet appareil.')
    setStatus('local')
  }, [])

  const showEntry = useCallback(() => {
    if (!configuration) return
    setNotice(null)
    setStatus('signed-out')
  }, [configuration])

  const getValidSession = useCallback(async () => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    const currentSession = sessionRef.current
    if (!currentSession) throw new Error('Authentification requise.')
    if (currentSession.expiresAt > Date.now() + 60_000) return currentSession
    const refreshed = await refreshAuthSession(configuration, currentSession.refreshToken)
    updateSession(refreshed)
    return refreshed
  }, [configuration, updateSession])

  const runAuthenticated = useCallback(async <T,>(
    operation: (validSession: AuthSession) => Promise<T>,
  ) => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    let validSession = await getValidSession()
    try {
      return await operation(validSession)
    } catch (error) {
      if (!(error instanceof SupabaseRequestError) || error.status !== 401) throw error
      validSession = await refreshAuthSession(configuration, validSession.refreshToken)
      updateSession(validSession)
      return operation(validSession)
    }
  }, [configuration, getValidSession, updateSession])

  const linkRecoveryEmail = useCallback(async (email: string) => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    await runAuthenticated(async (validSession) => {
      const user = await updateRecoveryEmail(
        configuration,
        validSession,
        email,
        emailRedirectTo(),
      )
      updateSession({ ...validSession, user })
    })
  }, [configuration, runAuthenticated, updateSession])

  const refreshRecoveryEmail = useCallback(async () => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    await runAuthenticated(async (validSession) => {
      const user = await fetchAuthUser(configuration, validSession)
      updateSession({ ...validSession, user })
    })
  }, [configuration, runAuthenticated, updateSession])

  const requestEmailLogin = useCallback(async (email: string) => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    await requestRecoveryEmailOtp(configuration, email, emailRedirectTo())
  }, [configuration])

  const verifyEmailLogin = useCallback(async (email: string, token: string) => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    const restoredSession = await verifyRecoveryEmailOtp(configuration, email, token)
    try {
      const restoredIdentity = await fetchExistingPlayerIdentity(configuration, restoredSession)
      updateSession(restoredSession)
      setIdentity(restoredIdentity)
      setRecoveryCode(loadStoredRecoveryCode(restoredSession.user.id))
      setSetupKind(null)
      setNotice('Connexion par email réussie.')
      setStatus('authenticated')
    } catch {
      try {
        await signOutSession(configuration, restoredSession)
      } catch {
        // Cette session n'est jamais persistée si elle n'appartient pas à un joueur AUTYCO.
      }
      throw new SupabaseRequestError(
        'Ce code est invalide ou expiré. Demande un nouvel email.',
        400,
        'invalid_email_otp',
      )
    }
  }, [configuration, updateSession])

  const rotateRecoveryCode = useCallback(async () => {
    if (!configuration) throw new Error('Supabase n’est pas configuré.')
    const nextCode = await runAuthenticated((validSession) =>
      issueAndStoreRecoveryCode(
        validSession.user.id,
        () => rotatePlayerRecoveryCode(configuration, validSession),
      )
    )
    setRecoveryCode(nextCode)
    return nextCode
  }, [configuration, runAuthenticated])

  const getRecoveryCode = useCallback(async () => {
    if (recoveryCode) return recoveryCode
    const playerId = sessionRef.current?.user.id
    if (!playerId) return null
    const storedCode = loadStoredRecoveryCode(playerId)
    setRecoveryCode(storedCode)
    return storedCode
  }, [recoveryCode])

  const getRemoteGame = useCallback(() => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) => fetchRemoteGame(configuration, validSession))
  }, [configuration, runAuthenticated])

  const sendRemoteAction = useCallback((action: GameAction) => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      performRemoteGameAction(configuration, validSession, action)
    )
  }, [configuration, runAuthenticated])

  const getCurrentPrivateServer = useCallback(() => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      fetchCurrentPrivateServer(configuration, validSession)
    )
  }, [configuration, runAuthenticated])

  const createServer = useCallback((name: string, replaceCurrent = false) => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      createPrivateServer(configuration, validSession, name, replaceCurrent)
    )
  }, [configuration, runAuthenticated])

  const joinServer = useCallback((inviteCode: string, replaceCurrent = false) => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      joinPrivateServer(configuration, validSession, inviteCode, replaceCurrent)
    )
  }, [configuration, runAuthenticated])

  const rotateServerInvite = useCallback(() => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      rotatePrivateServerInvite(configuration, validSession)
    )
  }, [configuration, runAuthenticated])

  const leaveServer = useCallback(() => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      leavePrivateServer(configuration, validSession)
    )
  }, [configuration, runAuthenticated])

  const closeServer = useCallback((serverId: string) => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      closePrivateServer(configuration, validSession, serverId)
    )
  }, [configuration, runAuthenticated])

  const getServerLeaderboard = useCallback(() => {
    if (!configuration) return Promise.reject(new Error('Supabase n’est pas configuré.'))
    return runAuthenticated((validSession) =>
      fetchPrivateServerLeaderboard(configuration, validSession)
    )
  }, [configuration, runAuthenticated])

  const value = useMemo<AuthContextValue>(() => ({
    status,
    configured: Boolean(configuration),
    session,
    identity,
    recoveryCode,
    setupKind,
    notice,
    createPlayer,
    restorePlayer,
    linkRecoveryEmail,
    refreshRecoveryEmail,
    requestEmailLogin,
    verifyEmailLogin,
    completeSetup,
    getRecoveryCode,
    rotateRecoveryCode,
    signOut,
    useLocalMode,
    showEntry,
    getRemoteGame,
    sendRemoteAction,
    getCurrentPrivateServer,
    createPrivateServer: createServer,
    joinPrivateServer: joinServer,
    rotatePrivateServerInvite: rotateServerInvite,
    leavePrivateServer: leaveServer,
    closePrivateServer: closeServer,
    getPrivateServerLeaderboard: getServerLeaderboard,
  }), [
    status, configuration, session, identity, recoveryCode, setupKind, notice,
    createPlayer, restorePlayer, linkRecoveryEmail, refreshRecoveryEmail,
    requestEmailLogin, verifyEmailLogin, completeSetup, getRecoveryCode, rotateRecoveryCode,
    signOut, useLocalMode, showEntry, getRemoteGame, sendRemoteAction,
    getCurrentPrivateServer, createServer, joinServer, rotateServerInvite,
    leaveServer, closeServer, getServerLeaderboard,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return context
}

export { readableError }
