import type { GameState, MarketListing, OwnedVehicle, GameNotification } from '../types/game'

const STORAGE_KEY = 'garage-game:save:v2'
const LEGACY_STORAGE_KEY = 'garage-game:save:v1'
const remoteStorageKey = (playerId: string) => `garage-game:remote-cache:${playerId}:v2`
const LAST_ACTIVE_KEY = 'garage-game:last-active:v1'
const remoteLastActiveKey = (playerId: string) => `garage-game:remote-last-active:${playerId}:v1`

export interface StorageAdapter {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

interface LegacyGameStateV1 {
  version: 1
  cash: number
  capacity: number
  profitToday: number
  profitDayKey: string
  vehicles: Array<Omit<OwnedVehicle, 'kept'> & { kept?: boolean }>
  listings: MarketListing[]
  notifications: GameNotification[]
}

const hasCommonStateShape = (value: unknown) => {
  if (!value || typeof value !== 'object') return false
  const candidate = value as {
    cash?: unknown
    profitToday?: unknown
    profitDayKey?: unknown
    vehicles?: unknown
    listings?: unknown
    notifications?: unknown
  }
  return (
    typeof candidate.cash === 'number' &&
    typeof candidate.profitToday === 'number' &&
    typeof candidate.profitDayKey === 'string' &&
    Array.isArray(candidate.vehicles) &&
    Array.isArray(candidate.listings) &&
    Array.isArray(candidate.notifications)
  )
}

const isGameState = (value: unknown): value is GameState => {
  if (!hasCommonStateShape(value)) return false
  const candidate = value as Partial<GameState>
  return (
    candidate.version === 2 &&
    Array.isArray(candidate.properties) &&
    candidate.vehicles?.every((vehicle) => typeof vehicle.kept === 'boolean') === true
  )
}

const isLegacyGameState = (value: unknown): value is LegacyGameStateV1 => {
  if (!hasCommonStateShape(value)) return false
  const candidate = value as Partial<LegacyGameStateV1>
  return candidate.version === 1 && typeof candidate.capacity === 'number'
}

export const migrateGameState = (value: unknown): GameState | null => {
  if (isGameState(value)) return value
  if (!isLegacyGameState(value)) return null
  return {
    version: 2,
    cash: value.cash,
    profitToday: value.profitToday,
    profitDayKey: value.profitDayKey,
    vehicles: value.vehicles.map((vehicle) => ({ ...vehicle, kept: vehicle.kept ?? false })),
    properties: [],
    listings: value.listings,
    notifications: value.notifications,
  }
}

const getBrowserStorage = (): StorageAdapter | null => {
  if (typeof window === 'undefined') return null
  return window.localStorage
}

export const saveGame = (state: GameState, storage = getBrowserStorage()) => {
  if (!storage) return false
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export const loadGame = (storage = getBrowserStorage()): GameState | null => {
  if (!storage) return null
  for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
    try {
      const rawSave = storage.getItem(key)
      if (!rawSave) continue
      const migrated = migrateGameState(JSON.parse(rawSave) as unknown)
      if (migrated) return migrated
    } catch {
      // Une sauvegarde invalide ne doit pas empêcher le repli sur la clé précédente.
    }
  }
  return null
}

export const saveRemoteGame = (
  state: GameState,
  playerId: string,
  storage = getBrowserStorage(),
) => {
  if (!storage || !playerId) return false
  try {
    storage.setItem(remoteStorageKey(playerId), JSON.stringify(state))
    return true
  } catch {
    return false
  }
}

export const loadRemoteGame = (
  playerId: string,
  storage = getBrowserStorage(),
): GameState | null => {
  if (!storage || !playerId) return null
  try {
    const rawSave = storage.getItem(remoteStorageKey(playerId))
    return rawSave ? migrateGameState(JSON.parse(rawSave) as unknown) : null
  } catch {
    return null
  }
}

export const saveLastActiveAt = (
  timestamp: number,
  playerId?: string,
  storage = getBrowserStorage(),
) => {
  if (!storage || !Number.isFinite(timestamp) || timestamp <= 0) return false
  try {
    storage.setItem(playerId ? remoteLastActiveKey(playerId) : LAST_ACTIVE_KEY, String(timestamp))
    return true
  } catch {
    return false
  }
}

export const loadLastActiveAt = (
  playerId?: string,
  storage = getBrowserStorage(),
): number | null => {
  if (!storage) return null
  try {
    const value = Number(storage.getItem(playerId ? remoteLastActiveKey(playerId) : LAST_ACTIVE_KEY))
    return Number.isFinite(value) && value > 0 ? value : null
  } catch {
    return null
  }
}
