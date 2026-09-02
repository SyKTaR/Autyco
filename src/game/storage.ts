import type {
  GameNotification,
  GameState,
  MarketListing,
  MarketTier,
  OwnedVehicle,
} from '../types/game'
import { PROBLEM_CATALOG, VEHICLE_CATALOG } from './catalog'

const STORAGE_KEY = 'garage-game:save:v2'
const LEGACY_STORAGE_KEY = 'garage-game:save:v1'
const remoteStorageKey = (playerId: string) => `garage-game:remote-cache:${playerId}:v2`
const LAST_ACTIVE_KEY = 'garage-game:last-active:v1'
const remoteLastActiveKey = (playerId: string) => `garage-game:remote-last-active:${playerId}:v1`
const severityByProblemId = new Map(
  PROBLEM_CATALOG.map((problem) => [problem.id, problem.severity]),
)
const marketByTemplateId = new Map(
  VEHICLE_CATALOG.map((template) => [template.id, template.market]),
)

const getListingMarket = (listing: MarketListing): MarketTier => {
  if (listing.market === 'standard' || listing.market === 'premium' || listing.market === 'collector') {
    return listing.market
  }
  return marketByTemplateId.get(listing.templateId)
    ?? (listing.segment.toLocaleLowerCase('fr-FR').includes('premium') ? 'premium' : 'standard')
}

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

type MigratableGameState = Omit<GameState, 'marketRefreshAt'> & {
  marketRefreshAt?: Record<MarketTier, number>
}

const withCurrentProblemShape = (state: MigratableGameState): GameState => ({
  ...state,
  listings: state.listings.map((listing) => ({
    ...listing,
    market: getListingMarket(listing),
  })),
  marketRefreshAt: Object.fromEntries(
    (['standard', 'premium', 'collector'] as const).map((market) => {
      const persisted = state.marketRefreshAt?.[market]
      if (typeof persisted === 'number' && Number.isFinite(persisted)) return [market, persisted]
      const expirations = state.listings
        .filter((listing) => getListingMarket(listing) === market)
        .map((listing) => listing.expiresAt)
        .filter((timestamp) => Number.isFinite(timestamp))
      return [market, expirations.length > 0 ? Math.max(...expirations) : Date.now()]
    }),
  ) as Record<MarketTier, number>,
  vehicles: state.vehicles.map((vehicle) => {
    const hasPersistedSelection = vehicle.problems.some(
      (problem) => typeof problem.selectedForRepair === 'boolean',
    )
    return {
      ...vehicle,
      problems: vehicle.problems.map((problem) => ({
        ...problem,
        severity: problem.severity === 'critical' || problem.severity === 'minor'
          ? problem.severity
          : severityByProblemId.get(problem.id) ?? 'minor',
        selectedForRepair: problem.selectedForRepair === true
          || (!hasPersistedSelection && vehicle.status === 'repairing' && !problem.repaired),
      })),
    }
  }),
})

export const migrateGameState = (value: unknown): GameState | null => {
  if (isGameState(value)) return withCurrentProblemShape(value)
  if (!isLegacyGameState(value)) return null
  return withCurrentProblemShape({
    version: 2,
    cash: value.cash,
    profitToday: value.profitToday,
    profitDayKey: value.profitDayKey,
    vehicles: value.vehicles.map((vehicle) => ({ ...vehicle, kept: vehicle.kept ?? false })),
    properties: [],
    listings: value.listings,
    notifications: value.notifications,
  })
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
