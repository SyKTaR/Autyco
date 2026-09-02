import { migrateGameState } from '../game/storage'
import type { GameAction, GameState } from '../types/game'

export interface SupabaseConfiguration {
  url: string
  publicKey: string
}

export interface AuthUser {
  id: string
  isAnonymous: boolean
}

export interface AuthSession {
  accessToken: string
  refreshToken: string
  expiresAt: number
  user: AuthUser
}

interface AuthApiResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  expires_at?: number
  user?: {
    id?: string
    email?: string
    is_anonymous?: boolean
  }
}

export interface PlayerIdentity {
  garageName: string
  playerName: string
}

export interface PlayerIdentityWithRecovery extends PlayerIdentity {
  recoveryCode: string
}

export interface PrivateServerSummary {
  id: string
  name: string
  memberCount: number
  createdAt: number
  isOwner: boolean
}

export interface PrivateServerMember {
  rank: number
  playerId: string
  playerName: string
  garageName: string
  cash: number
  fleetValue: number
  totalValue: number
  vehicleCount: number
  isCurrentPlayer: boolean
}

export interface PrivateServerMutation {
  ok: boolean
  server?: PrivateServerSummary
  inviteCode?: string
  requiresConfirmation?: boolean
  rateLimited?: boolean
  error?: string
}

export interface PrivateServerLeaderboard {
  server: PrivateServerSummary
  members: PrivateServerMember[]
}

interface RecoveryApiResponse extends Partial<PlayerIdentityWithRecovery> {
  ok?: boolean
  error?: string
}

type RuntimeEnvironment = Record<string, string | boolean | undefined>

const SESSION_STORAGE_KEY = 'garage-game:supabase-session:v2'
const LEGACY_SESSION_STORAGE_KEY = 'garage-game:supabase-session:v1'
const REQUEST_TIMEOUT_MS = 12_000

const runtimeEnvironment =
  ((import.meta as ImportMeta & { env?: RuntimeEnvironment }).env ?? {}) as RuntimeEnvironment

export class SupabaseRequestError extends Error {
  readonly status: number
  readonly code?: string

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'SupabaseRequestError'
    this.status = status
    this.code = code
  }
}

const normalizeUrl = (rawUrl: string) => rawUrl.trim().replace(/\/+$/, '')

const isAllowedSupabaseUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl)
    return (
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))
    )
  } catch {
    return false
  }
}

const isServiceRoleKey = (key: string) => {
  if (key.startsWith('sb_secret_')) return true
  const [, encodedPayload] = key.split('.')
  if (!encodedPayload || typeof atob !== 'function') return false
  try {
    // Lecture défensive d’une clé fournie par l’opérateur, jamais utilisée comme preuve d’identité.
    const normalized = encodedPayload.replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(normalized)) as { role?: unknown }
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

export const loadSupabaseConfiguration = (
  environment: RuntimeEnvironment = runtimeEnvironment,
): SupabaseConfiguration | null => {
  const rawUrl = environment.VITE_SUPABASE_URL
  const rawKey =
    environment.VITE_SUPABASE_PUBLISHABLE_KEY ?? environment.VITE_SUPABASE_ANON_KEY

  if (typeof rawUrl !== 'string' || typeof rawKey !== 'string') return null
  const url = normalizeUrl(rawUrl)
  const publicKey = rawKey.trim()
  if (!isAllowedSupabaseUrl(url) || publicKey.length < 20 || isServiceRoleKey(publicKey)) {
    return null
  }
  return { url, publicKey }
}

const parseResponseBody = async (response: Response) => {
  const rawBody = await response.text()
  if (!rawBody) return null
  try {
    return JSON.parse(rawBody) as unknown
  } catch {
    return rawBody
  }
}

const errorFromResponse = (body: unknown, status: number) => {
  if (body && typeof body === 'object') {
    const errorBody = body as Record<string, unknown>
    const message = [
      errorBody.message,
      errorBody.error_description,
      errorBody.msg,
      errorBody.error,
    ].find((value): value is string => typeof value === 'string' && value.length > 0)
    const code = typeof errorBody.code === 'string' ? errorBody.code : undefined
    return new SupabaseRequestError(message ?? 'Supabase a refusé la requête.', status, code)
  }
  return new SupabaseRequestError(
    typeof body === 'string' && body ? body : 'Supabase a refusé la requête.',
    status,
  )
}

const request = async <T>(
  configuration: SupabaseConfiguration,
  path: string,
  init: RequestInit,
  accessToken?: string,
) => {
  let response: Response
  const abortController = new AbortController()
  const timeout = setTimeout(() => abortController.abort(), REQUEST_TIMEOUT_MS)
  try {
    response = await fetch(`${configuration.url}${path}`, {
      ...init,
      signal: abortController.signal,
      headers: {
        apikey: configuration.publicKey,
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    })
  } catch (error) {
    const message = abortController.signal.aborted
      ? 'Supabase ne répond pas dans le délai attendu.'
      : 'Supabase est injoignable. Vérifie ta connexion.'
    throw new SupabaseRequestError(message, 0, error instanceof Error ? error.name : undefined)
  } finally {
    clearTimeout(timeout)
  }

  const body = await parseResponseBody(response)
  if (!response.ok) throw errorFromResponse(body, response.status)
  return body as T
}

const sessionFromResponse = (response: AuthApiResponse): AuthSession | null => {
  const accessToken = response.access_token
  const refreshToken = response.refresh_token
  const userId = response.user?.id
  if (!accessToken || !refreshToken || !userId) return null

  const expiresAt = response.expires_at
    ? response.expires_at * 1_000
    : Date.now() + (response.expires_in ?? 3600) * 1_000
  return {
    accessToken,
    refreshToken,
    expiresAt,
    user: {
      id: userId,
      isAnonymous: response.user?.is_anonymous ?? !response.user?.email,
    },
  }
}

export const signInAnonymously = async (
  configuration: SupabaseConfiguration,
  garageName?: string,
  playerName?: string,
) => {
  const response = await request<AuthApiResponse>(configuration, '/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({
      data: {
        ...(garageName ? { garage_name: garageName.trim() } : {}),
        ...(playerName ? { player_name: playerName.trim() } : {}),
      },
    }),
  })
  const session = sessionFromResponse(response)
  if (!session) throw new SupabaseRequestError('Supabase n’a pas ouvert la session anonyme.', 502)
  return session
}

const isPlayerIdentity = (value: unknown): value is PlayerIdentity => {
  if (!value || typeof value !== 'object') return false
  const identity = value as Record<string, unknown>
  return typeof identity.garageName === 'string' && typeof identity.playerName === 'string'
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const privateServerFromResponse = (value: unknown): PrivateServerSummary => {
  if (!isRecord(value)
    || typeof value.id !== 'string'
    || typeof value.name !== 'string'
    || typeof value.memberCount !== 'number'
    || typeof value.createdAt !== 'number'
    || typeof value.isOwner !== 'boolean') {
    throw new SupabaseRequestError('Supabase a renvoyé un serveur privé invalide.', 502)
  }
  return {
    id: value.id,
    name: value.name,
    memberCount: value.memberCount,
    createdAt: value.createdAt,
    isOwner: value.isOwner,
  }
}

const privateServerMutationFromResponse = (value: unknown): PrivateServerMutation => {
  if (!isRecord(value) || typeof value.ok !== 'boolean') {
    throw new SupabaseRequestError('Supabase a renvoyé une réponse multijoueur invalide.', 502)
  }
  return {
    ok: value.ok,
    ...(value.server == null ? {} : { server: privateServerFromResponse(value.server) }),
    ...(typeof value.inviteCode === 'string' ? { inviteCode: value.inviteCode } : {}),
    ...(typeof value.requiresConfirmation === 'boolean'
      ? { requiresConfirmation: value.requiresConfirmation }
      : {}),
    ...(typeof value.rateLimited === 'boolean' ? { rateLimited: value.rateLimited } : {}),
    ...(typeof value.error === 'string' ? { error: value.error } : {}),
  }
}

const privateServerMemberFromResponse = (value: unknown): PrivateServerMember => {
  if (!isRecord(value)
    || typeof value.rank !== 'number'
    || typeof value.playerId !== 'string'
    || typeof value.playerName !== 'string'
    || typeof value.garageName !== 'string'
    || typeof value.cash !== 'number'
    || typeof value.fleetValue !== 'number'
    || typeof value.totalValue !== 'number'
    || typeof value.vehicleCount !== 'number'
    || typeof value.isCurrentPlayer !== 'boolean') {
    throw new SupabaseRequestError('Supabase a renvoyé un membre invalide.', 502)
  }
  return {
    rank: value.rank,
    playerId: value.playerId,
    playerName: value.playerName,
    garageName: value.garageName,
    cash: value.cash,
    fleetValue: value.fleetValue,
    totalValue: value.totalValue,
    vehicleCount: value.vehicleCount,
    isCurrentPlayer: value.isCurrentPlayer,
  }
}

const identityWithRecoveryFromResponse = (value: unknown): PlayerIdentityWithRecovery => {
  if (!isPlayerIdentity(value)) {
    throw new SupabaseRequestError('Supabase a renvoyé une identité invalide.', 502)
  }
  const recoveryCode = (value as PlayerIdentity & { recoveryCode?: unknown }).recoveryCode
  if (typeof recoveryCode !== 'string') {
    throw new SupabaseRequestError('Supabase n’a pas généré de code de récupération.', 502)
  }
  return { ...value, recoveryCode }
}

export const createPlayerIdentity = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
  garageName: string,
  playerName: string,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/create_player_identity',
    {
      method: 'POST',
      body: JSON.stringify({
        p_garage_name: garageName.trim(),
        p_player_name: playerName.trim(),
      }),
    },
    session.accessToken,
  )
  return identityWithRecoveryFromResponse(response)
}

export const fetchPlayerIdentity = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/get_player_identity',
    { method: 'POST', body: '{}' },
    session.accessToken,
  )
  if (!isPlayerIdentity(response)) {
    throw new SupabaseRequestError('Supabase a renvoyé une identité invalide.', 502)
  }
  return response
}

export const rotatePlayerRecoveryCode = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/rotate_recovery_code',
    { method: 'POST', body: '{}' },
    session.accessToken,
  )
  if (typeof response !== 'string') {
    throw new SupabaseRequestError('Supabase n’a pas généré de code de récupération.', 502)
  }
  return response
}

export const recoverPlayer = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
  recoveryCode: string,
) => {
  const response = await request<RecoveryApiResponse>(
    configuration,
    '/rest/v1/rpc/recover_player',
    {
      method: 'POST',
      body: JSON.stringify({ p_recovery_code: recoveryCode }),
    },
    session.accessToken,
  )
  if (!response?.ok) {
    const rateLimited = response?.error?.includes('15 minutes')
    throw new SupabaseRequestError(
      response?.error ?? 'Ce code de récupération est invalide.',
      rateLimited ? 429 : 400,
      rateLimited ? 'recovery_rate_limited' : 'invalid_recovery_code',
    )
  }
  return identityWithRecoveryFromResponse(response)
}

export const fetchCurrentPrivateServer = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
): Promise<PrivateServerSummary | null> => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/get_current_private_server',
    { method: 'POST', body: '{}' },
    session.accessToken,
  )
  if (!isRecord(response) || !('server' in response)) {
    throw new SupabaseRequestError('Supabase a renvoyé une appartenance invalide.', 502)
  }
  return response.server == null ? null : privateServerFromResponse(response.server)
}

export const createPrivateServer = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
  name: string,
  replaceCurrent = false,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/create_private_server',
    {
      method: 'POST',
      body: JSON.stringify({
        p_name: name.trim(),
        p_replace_current: replaceCurrent,
      }),
    },
    session.accessToken,
  )
  return privateServerMutationFromResponse(response)
}

export const joinPrivateServer = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
  inviteCode: string,
  replaceCurrent = false,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/join_private_server',
    {
      method: 'POST',
      body: JSON.stringify({
        p_invite_code: inviteCode,
        p_replace_current: replaceCurrent,
      }),
    },
    session.accessToken,
  )
  return privateServerMutationFromResponse(response)
}

export const rotatePrivateServerInvite = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/rotate_private_server_invite',
    { method: 'POST', body: '{}' },
    session.accessToken,
  )
  if (typeof response !== 'string') {
    throw new SupabaseRequestError('Supabase n’a pas généré de code d’invitation.', 502)
  }
  return response
}

export const leavePrivateServer = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/leave_private_server',
    { method: 'POST', body: '{}' },
    session.accessToken,
  )
  const result = privateServerMutationFromResponse(response)
  if (!result.ok) {
    throw new SupabaseRequestError(result.error ?? 'Impossible de quitter ce serveur.', 400)
  }
}

export const closePrivateServer = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
  serverId: string,
) => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/close_private_server',
    { method: 'POST', body: JSON.stringify({ p_server_id: serverId }) },
    session.accessToken,
  )
  const result = privateServerMutationFromResponse(response)
  if (!result.ok) {
    throw new SupabaseRequestError(result.error ?? 'Impossible de fermer ce serveur.', 400)
  }
}

export const fetchPrivateServerLeaderboard = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
): Promise<PrivateServerLeaderboard> => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/get_private_server_leaderboard',
    { method: 'POST', body: '{}' },
    session.accessToken,
  )
  if (!isRecord(response) || !Array.isArray(response.members)) {
    throw new SupabaseRequestError('Supabase a renvoyé un classement invalide.', 502)
  }
  return {
    server: privateServerFromResponse(response.server),
    members: response.members.map(privateServerMemberFromResponse),
  }
}

export const refreshAuthSession = async (
  configuration: SupabaseConfiguration,
  refreshToken: string,
) => {
  const response = await request<AuthApiResponse>(
    configuration,
    '/auth/v1/token?grant_type=refresh_token',
    { method: 'POST', body: JSON.stringify({ refresh_token: refreshToken }) },
  )
  const session = sessionFromResponse(response)
  if (!session) throw new SupabaseRequestError('Impossible de renouveler la session.', 401)
  return session
}

export const signOutSession = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
) => {
  await request<null>(configuration, '/auth/v1/logout', { method: 'POST' }, session.accessToken)
}

const validateRemoteState = (value: unknown) => {
  const state = migrateGameState(value)
  if (!state) throw new SupabaseRequestError('Supabase a renvoyé un état de jeu invalide.', 502)
  return state
}

export const fetchRemoteGame = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
): Promise<GameState> => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/get_game_state',
    { method: 'POST', body: '{}' },
    session.accessToken,
  )
  return validateRemoteState(response)
}

const actionPayload = (action: GameAction): Record<string, unknown> => {
  switch (action.type) {
    case 'BUY_LISTING':
    case 'IGNORE_LISTING':
      return { listingId: action.listingId }
    case 'DIAGNOSE_VEHICLE':
    case 'SKIP_REPAIR':
    case 'ACCEPT_OFFER':
    case 'TOGGLE_VEHICLE_KEPT':
      return { vehicleId: action.vehicleId }
    case 'START_REPAIR':
      return { vehicleId: action.vehicleId, problemIds: action.problemIds }
    case 'REJECT_OFFER':
      return { vehicleId: action.vehicleId }
    case 'LIST_VEHICLE':
      return { vehicleId: action.vehicleId, price: action.price }
    case 'ACQUIRE_PROPERTY':
      return { offerId: action.offerId }
    case 'START_PROPERTY_WORKS':
      return { propertyId: action.propertyId }
    case 'DISMISS_NOTIFICATION':
      return { notificationId: action.notificationId }
    case 'TICK':
      return {}
  }
}

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  throw new SupabaseRequestError('Ce navigateur ne peut pas sécuriser la requête de jeu.', 0)
}

export const performRemoteGameAction = async (
  configuration: SupabaseConfiguration,
  session: AuthSession,
  action: GameAction,
): Promise<GameState> => {
  const response = await request<unknown>(
    configuration,
    '/rest/v1/rpc/game_action',
    {
      method: 'POST',
      body: JSON.stringify({
        p_action: action.type,
        p_payload: actionPayload(action),
        p_request_id: createRequestId(),
      }),
    },
    session.accessToken,
  )
  return validateRemoteState(response)
}

const getBrowserStorage = () => (typeof window === 'undefined' ? null : window.localStorage)

export const loadStoredSession = (storage = getBrowserStorage()): AuthSession | null => {
  if (!storage) return null
  try {
    storage.removeItem(LEGACY_SESSION_STORAGE_KEY)
    const rawSession = storage.getItem(SESSION_STORAGE_KEY)
    if (!rawSession) return null
    const value = JSON.parse(rawSession) as Partial<AuthSession>
    if (
      typeof value.accessToken !== 'string' ||
      typeof value.refreshToken !== 'string' ||
      typeof value.expiresAt !== 'number' ||
      typeof value.user?.id !== 'string' ||
      typeof value.user?.isAnonymous !== 'boolean'
    ) return null
    return value as AuthSession
  } catch {
    return null
  }
}

export const storeSession = (
  session: AuthSession | null,
  storage = getBrowserStorage(),
) => {
  if (!storage) return
  storage.removeItem(LEGACY_SESSION_STORAGE_KEY)
  if (!session) {
    storage.removeItem(SESSION_STORAGE_KEY)
    return
  }
  storage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}
