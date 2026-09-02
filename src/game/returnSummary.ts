import type { GameState, VehicleStatus } from '../types/game'

const MINIMUM_AWAY_DURATION_MS = 30_000

const ACTIONABLE_VEHICLE_STATUSES = new Set<VehicleStatus>([
  'needs-diagnosis',
  'needs-decision',
  'ready',
  'offer-received',
])

export interface ReturnSummary {
  awayDurationMs: number
  cashDelta: number
  repairsCompleted: number
  offersReceived: number
  propertiesOpened: number
  showroomOffersReceived: number
  staffPaused: number
  actionCount: number
}

export const getGarageActionCount = (state: GameState) =>
  state.vehicles.filter(
    (vehicle) => ACTIONABLE_VEHICLE_STATUSES.has(vehicle.status) && !vehicle.kept,
  ).length

export const getPropertyActionCount = (state: GameState) =>
  state.properties.filter((property) => property.status === 'works-required').length
  + state.showroomOffers.length
  + state.staff.filter((employee) => employee.salaryArrears > 0).length

export const createReturnSummary = (
  previousState: GameState | null,
  currentState: GameState,
  lastActiveAt: number | null,
  now = Date.now(),
): ReturnSummary | null => {
  if (!previousState || !lastActiveAt) return null

  const awayDurationMs = Math.max(0, now - lastActiveAt)
  if (awayDurationMs < MINIMUM_AWAY_DURATION_MS) return null

  const previousVehicles = new Map(
    previousState.vehicles.map((vehicle) => [vehicle.id, vehicle]),
  )
  const previousProperties = new Map(
    previousState.properties.map((property) => [property.instanceId, property]),
  )

  const repairsCompleted = currentState.vehicles.filter((vehicle) => {
    const previousVehicle = previousVehicles.get(vehicle.id)
    return previousVehicle?.status === 'repairing' && vehicle.status !== 'repairing'
  }).length

  const offersReceived = currentState.vehicles.filter((vehicle) => {
    const previousVehicle = previousVehicles.get(vehicle.id)
    return previousVehicle?.status === 'listed' && vehicle.status === 'offer-received'
  }).length

  const propertiesOpened = currentState.properties.filter((property) => {
    const previousProperty = previousProperties.get(property.instanceId)
    return previousProperty?.status === 'renovating' && property.status === 'operational'
  }).length

  const previousShowroomOfferIds = new Set(
    previousState.showroomOffers.map((offer) => offer.id),
  )
  const showroomOffersReceived = currentState.showroomOffers.filter(
    (offer) => !previousShowroomOfferIds.has(offer.id),
  ).length
  const previousStaff = new Map(previousState.staff.map((employee) => [employee.id, employee]))
  const staffPaused = currentState.staff.filter((employee) =>
    employee.pausedReason === 'payroll'
    && previousStaff.get(employee.id)?.pausedReason !== 'payroll',
  ).length

  const cashDelta = currentState.cash - previousState.cash
  const actionCount = getGarageActionCount(currentState) + getPropertyActionCount(currentState)
  const hasNews = repairsCompleted > 0
    || offersReceived > 0
    || propertiesOpened > 0
    || showroomOffersReceived > 0
    || staffPaused > 0
    || cashDelta !== 0

  if (!hasNews) return null

  return {
    awayDurationMs,
    cashDelta,
    repairsCompleted,
    offersReceived,
    propertiesOpened,
    showroomOffersReceived,
    staffPaused,
    actionCount,
  }
}
