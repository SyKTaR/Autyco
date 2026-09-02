import { PROBLEM_CATALOG, VEHICLE_CATALOG } from './catalog'
import {
  BASE_GARAGE_CAPACITY,
  PROPERTY_CHARGE_CYCLE_MS,
  PROPERTY_MARKET,
} from './properties'
import type {
  GameNotification,
  GameState,
  MarketTier,
  MarketListing,
  OwnedVehicle,
  OwnedProperty,
  RiskLevel,
  VehicleProblem,
} from '../types/game'

export type RandomSource = () => number

const STARTING_CASH = 20_000
export const CRITICAL_RESALE_CAP_FACTOR = 0.55

export const MARKET_TIERS: MarketTier[] = ['standard', 'premium', 'collector']
export const MARKET_CONFIG: Record<
  MarketTier,
  { target: number; refreshSeconds: readonly [number, number] }
> = {
  standard: { target: 7, refreshSeconds: [120, 180] },
  premium: { target: 4, refreshSeconds: [720, 1_080] },
  collector: { target: 2, refreshSeconds: [5_400, 9_000] },
}

const roundTo = (value: number, step: number) => Math.round(value / step) * step
const boundedRandom = (random: RandomSource) => Math.max(0, Math.min(0.999_999, random()))
const randomBetween = (min: number, max: number, random: RandomSource) =>
  min + boundedRandom(random) * (max - min)
const randomInteger = (min: number, max: number, random: RandomSource) =>
  Math.floor(randomBetween(min, max + 1, random))

const makeId = (prefix: string, now: number, random: RandomSource) =>
  `${prefix}-${now.toString(36)}-${Math.floor(boundedRandom(random) * 1_000_000).toString(36)}`

export const getDayKey = (timestamp: number) => {
  const date = new Date(timestamp)
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

const getRisk = (random: RandomSource): RiskLevel => {
  const roll = boundedRandom(random)
  if (roll < 0.36) return 'low'
  if (roll < 0.76) return 'medium'
  return 'high'
}

const riskPriceFactor: Record<RiskLevel, [number, number]> = {
  low: [0.82, 0.9],
  medium: [0.74, 0.84],
  high: [0.64, 0.77],
}

const riskCondition: Record<RiskLevel, string> = {
  low: 'Semble soignée',
  medium: 'État correct',
  high: 'À inspecter',
}

const createListing = (
  templateIndex: number,
  now: number,
  random: RandomSource,
  expiresAt: number,
): MarketListing => {
  const template = VEHICLE_CATALOG[templateIndex]
  const risk = getRisk(random)
  const year = randomInteger(template.yearMin, template.yearMax, random)
  const ageAdjustment = 1 + (year - (template.yearMin + template.yearMax) / 2) * 0.035
  const marketValue = roundTo(
    template.marketValue * ageAdjustment * randomBetween(0.97, 1.04, random),
    100,
  )
  const [minFactor, maxFactor] = riskPriceFactor[risk]

  return {
    id: makeId('listing', now + templateIndex, random),
    templateId: template.id,
    maker: template.maker,
    model: template.model,
    segment: template.segment,
    market: template.market,
    year,
    mileage: roundTo(randomInteger(template.mileageMin, template.mileageMax, random), 500),
    askingPrice: roundTo(marketValue * randomBetween(minFactor, maxFactor, random), 100),
    marketValue,
    risk,
    conditionHint: riskCondition[risk],
    expiresAt,
  }
}

export const getNextMarketRefreshAt = (
  market: MarketTier,
  now: number,
  random: RandomSource = Math.random,
) => {
  const [minimum, maximum] = MARKET_CONFIG[market].refreshSeconds
  return now + randomInteger(minimum, maximum, random) * 1_000
}

export const generateListings = (
  count: number,
  now: number,
  random: RandomSource = Math.random,
  excludedTemplateIds: string[] = [],
  market?: MarketTier,
  expiresAt?: number,
) => {
  const availableIndexes = VEHICLE_CATALOG.map((_, index) => index).filter(
    (index) =>
      !excludedTemplateIds.includes(VEHICLE_CATALOG[index].id)
      && (!market || VEHICLE_CATALOG[index].market === market),
  )
  const listings: MarketListing[] = []

  while (listings.length < count && availableIndexes.length > 0) {
    const availableIndex = Math.floor(boundedRandom(random) * availableIndexes.length)
    const [templateIndex] = availableIndexes.splice(availableIndex, 1)
    const templateMarket = VEHICLE_CATALOG[templateIndex].market
    listings.push(createListing(
      templateIndex,
      now + listings.length,
      random,
      expiresAt ?? getNextMarketRefreshAt(templateMarket, now, random),
    ))
  }

  return listings
}

const createMarketRefreshSchedule = (now: number, random: RandomSource) =>
  Object.fromEntries(
    MARKET_TIERS.map((market) => [market, getNextMarketRefreshAt(market, now, random)]),
  ) as Record<MarketTier, number>

const createMarketListings = (
  now: number,
  random: RandomSource,
  refreshAt: Record<MarketTier, number>,
) => MARKET_TIERS.flatMap((market) => generateListings(
  MARKET_CONFIG[market].target,
  now,
  random,
  [],
  market,
  refreshAt[market],
))

const withNotification = (
  state: GameState,
  message: string,
  tone: GameNotification['tone'],
  random: RandomSource = Math.random,
): GameState => ({
  ...state,
  notifications: [
    ...state.notifications.slice(-2),
    { id: makeId('note', Date.now(), random), message, tone },
  ],
})

export const createInitialGame = (
  now = Date.now(),
  random: RandomSource = Math.random,
): GameState => {
  const marketRefreshAt = createMarketRefreshSchedule(now, random)
  return {
    version: 2,
    cash: STARTING_CASH,
    profitToday: 0,
    profitDayKey: getDayKey(now),
    vehicles: [],
    properties: [],
    listings: createMarketListings(now, random, marketRefreshAt),
    marketRefreshAt,
    notifications: [],
  }
}

export const getGarageCapacity = (state: GameState) =>
  BASE_GARAGE_CAPACITY +
  state.properties
    .filter((property) => property.status === 'operational')
    .reduce((total, property) => total + property.capacity, 0)

export const getPropertyCycleCost = (property: OwnedProperty) =>
  property.rentPerCycle + property.chargesPerCycle

export const getRecurringPropertyCosts = (state: GameState) =>
  state.properties.reduce((total, property) => total + getPropertyCycleCost(property), 0)

const getSelectedUnrepairedProblems = (
  vehicle: OwnedVehicle,
  problemIds?: readonly string[],
) => {
  const selectedIds = problemIds ? new Set(problemIds) : null
  return vehicle.problems.filter(
    (problem) => !problem.repaired && (!selectedIds || selectedIds.has(problem.id)),
  )
}

export const getRepairCost = (vehicle: OwnedVehicle, problemIds?: readonly string[]) =>
  getSelectedUnrepairedProblems(vehicle, problemIds)
    .reduce((sum, problem) => sum + problem.cost, 0)

export const getRepairDuration = (vehicle: OwnedVehicle, problemIds?: readonly string[]) => {
  const seconds = getSelectedUnrepairedProblems(vehicle, problemIds)
    .reduce((sum, problem) => sum + problem.durationSeconds, 0)
  return Math.min(18, Math.max(6, Math.round(seconds * 0.72)))
}

export const getUnresolvedCriticalProblems = (vehicle: OwnedVehicle) =>
  vehicle.problems.filter((problem) => !problem.repaired && problem.severity === 'critical')

export const getVehicleResaleValue = (vehicle: OwnedVehicle) => {
  const unresolvedImpact = vehicle.problems
    .filter((problem) => !problem.repaired)
    .reduce((sum, problem) => sum + problem.resaleImpact, 0)
  const proportionalValue = roundTo(vehicle.marketValue - unresolvedImpact, 100)
  const criticalCap = getUnresolvedCriticalProblems(vehicle).length > 0
    ? roundTo(vehicle.marketValue * CRITICAL_RESALE_CAP_FACTOR, 100)
    : Number.POSITIVE_INFINITY
  return Math.max(Math.min(proportionalValue, criticalCap), 1_000)
}

export const getProjectedResaleValue = (
  vehicle: OwnedVehicle,
  repairedProblemIds: readonly string[],
) => {
  const selectedIds = new Set(repairedProblemIds)
  return getVehicleResaleValue({
    ...vehicle,
    problems: vehicle.problems.map((problem) =>
      selectedIds.has(problem.id) ? { ...problem, repaired: true } : problem,
    ),
  })
}

export const getMaximumAskingPrice = (vehicle: OwnedVehicle) =>
  getUnresolvedCriticalProblems(vehicle).length > 0 ? getVehicleResaleValue(vehicle) : null

export const getVehicleInvestment = (vehicle: OwnedVehicle) =>
  vehicle.purchasePrice + vehicle.repairCosts

export const getSaleChance = (vehicle: OwnedVehicle, price: number) => {
  const fairValue = getVehicleResaleValue(vehicle)
  const ratio = price / fairValue
  if (ratio <= 0.94) return 0.88
  if (ratio <= 0.99) return 0.74
  if (ratio <= 1.03) return 0.58
  if (ratio <= 1.08) return 0.39
  return 0.24
}

const selectProblems = (risk: RiskLevel, random: RandomSource): VehicleProblem[] => {
  const countByRisk: Record<RiskLevel, [number, number]> = {
    low: [1, 1],
    medium: [1, 2],
    high: [2, 3],
  }
  const [minimum, maximum] = countByRisk[risk]
  const count = randomInteger(minimum, maximum, random)
  const available = [...PROBLEM_CATALOG]
  const selected: VehicleProblem[] = []

  while (selected.length < count) {
    const index = Math.floor(boundedRandom(random) * available.length)
    const [problem] = available.splice(index, 1)
    selected.push({ ...problem, repaired: false, selectedForRepair: false })
  }

  return selected
}

const refreshMarkets = (state: GameState, now: number, random: RandomSource) => {
  let listings = state.listings
  const marketRefreshAt = { ...state.marketRefreshAt }
  let changed = false

  for (const market of MARKET_TIERS) {
    if (now < marketRefreshAt[market]) continue
    changed = true
    const nextRefreshAt = getNextMarketRefreshAt(market, now, random)
    marketRefreshAt[market] = nextRefreshAt
    listings = [
      ...listings.filter((listing) => listing.market !== market),
      ...generateListings(
        MARKET_CONFIG[market].target,
        now,
        random,
        [],
        market,
        nextRefreshAt,
      ),
    ]
  }

  return changed ? { ...state, listings, marketRefreshAt } : state
}

export const buyListing = (
  state: GameState,
  listingId: string,
  now: number,
  random: RandomSource = Math.random,
): GameState => {
  const listing = state.listings.find((item) => item.id === listingId)
  if (!listing) return state
  if (state.vehicles.length >= getGarageCapacity(state)) {
    return withNotification(state, 'Le garage est complet. Libère une place avant d’acheter.', 'warning', random)
  }
  if (state.cash < listing.askingPrice) {
    return withNotification(state, 'Trésorerie insuffisante pour cet achat.', 'warning', random)
  }

  const vehicle: OwnedVehicle = {
    id: makeId('vehicle', now, random),
    listingId: listing.id,
    templateId: listing.templateId,
    maker: listing.maker,
    model: listing.model,
    segment: listing.segment,
    year: listing.year,
    mileage: listing.mileage,
    purchasePrice: listing.askingPrice,
    marketValue: listing.marketValue,
    risk: listing.risk,
    status: 'needs-diagnosis',
    problems: [],
    repairCosts: 0,
    repairsSkipped: false,
    kept: false,
    acquiredAt: now,
  }

  const nextState: GameState = {
    ...state,
    cash: state.cash - listing.askingPrice,
    vehicles: [...state.vehicles, vehicle],
    listings: state.listings.filter((item) => item.id !== listingId),
  }

  return withNotification(
    nextState,
    `${listing.model} achetée · ${nextState.vehicles.length}/${getGarageCapacity(nextState)} places occupées.`,
    'success',
    random,
  )
}

export const ignoreListing = (
  state: GameState,
  listingId: string,
  _now: number,
  _random: RandomSource = Math.random,
) => {
  if (!state.listings.some((listing) => listing.id === listingId)) return state
  return { ...state, listings: state.listings.filter((listing) => listing.id !== listingId) }
}

export const diagnoseVehicle = (
  state: GameState,
  vehicleId: string,
  random: RandomSource = Math.random,
) => {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (!vehicle || vehicle.status !== 'needs-diagnosis') return state
  const problems = selectProblems(vehicle.risk, random)
  const repairCost = problems.reduce((sum, problem) => sum + problem.cost, 0)
  const nextState = {
    ...state,
    vehicles: state.vehicles.map((item) =>
      item.id === vehicleId ? { ...item, problems, status: 'needs-decision' as const } : item,
    ),
  }
  return withNotification(
    nextState,
    `Diagnostic terminé : ${problems.length} poste${problems.length > 1 ? 's' : ''}, ${repairCost.toLocaleString('fr-FR')} € à prévoir.`,
    problems.length > 1 ? 'warning' : 'neutral',
    random,
  )
}

export const startRepair = (
  state: GameState,
  vehicleId: string,
  problemIds: readonly string[],
  now: number,
  random: RandomSource = Math.random,
) => {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (!vehicle || vehicle.status !== 'needs-decision') return state
  const selectedProblems = getSelectedUnrepairedProblems(vehicle, problemIds)
  const requestedIds = new Set(problemIds)
  if (selectedProblems.length === 0 || selectedProblems.length !== requestedIds.size) {
    return withNotification(state, 'Sélection de réparations invalide.', 'warning', random)
  }
  const selectedIds = new Set(selectedProblems.map((problem) => problem.id))
  const cost = getRepairCost(vehicle, [...selectedIds])
  if (state.cash < cost) {
    return withNotification(state, 'Trésorerie insuffisante pour lancer les réparations.', 'warning', random)
  }
  const repairCompletesAt = now + getRepairDuration(vehicle, [...selectedIds]) * 1_000
  const unresolvedAfterRepair = vehicle.problems.filter(
    (problem) => !problem.repaired && !selectedIds.has(problem.id),
  ).length
  return withNotification(
    {
      ...state,
      cash: state.cash - cost,
      vehicles: state.vehicles.map((item) =>
        item.id === vehicleId
          ? {
              ...item,
              problems: item.problems.map((problem) => ({
                ...problem,
                selectedForRepair: !problem.repaired && selectedIds.has(problem.id),
              })),
              repairCosts: item.repairCosts + cost,
              repairsSkipped: unresolvedAfterRepair > 0,
              repairStartedAt: now,
              repairCompletesAt,
              status: 'repairing' as const,
            }
          : item,
      ),
    },
    `${selectedProblems.length} intervention${selectedProblems.length > 1 ? 's' : ''} lancée${selectedProblems.length > 1 ? 's' : ''} sur la ${vehicle.model}.`,
    'neutral',
    random,
  )
}

export const skipRepair = (
  state: GameState,
  vehicleId: string,
  random: RandomSource = Math.random,
) => {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (!vehicle || vehicle.status !== 'needs-decision') return state
  return withNotification(
    {
      ...state,
      vehicles: state.vehicles.map((item) =>
        item.id === vehicleId
          ? {
              ...item,
              problems: item.problems.map((problem) => ({
                ...problem,
                selectedForRepair: false,
              })),
              repairsSkipped: true,
              status: 'ready' as const,
            }
          : item,
      ),
    },
    `${vehicle.model} préparée pour une vente en l’état.`,
    'warning',
    random,
  )
}

export const listVehicle = (
  state: GameState,
  vehicleId: string,
  price: number,
  now: number,
  random: RandomSource = Math.random,
) => {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (
    !vehicle ||
    vehicle.kept ||
    vehicle.status !== 'ready' ||
    !Number.isFinite(price) ||
    price < 1_000
  ) return state
  const normalizedPrice = roundTo(price, 100)
  const maximumAskingPrice = getMaximumAskingPrice(vehicle)
  if (maximumAskingPrice !== null && normalizedPrice > maximumAskingPrice) {
    return withNotification(
      state,
      `Prix plafonné à ${maximumAskingPrice.toLocaleString('fr-FR')} € tant qu’une grosse panne reste ouverte.`,
      'warning',
      random,
    )
  }
  const chance = getSaleChance(vehicle, normalizedPrice)
  return withNotification(
    {
      ...state,
      vehicles: state.vehicles.map((item) =>
        item.id === vehicleId
          ? {
              ...item,
              askingPrice: normalizedPrice,
              saleChance: chance,
              nextOfferAt: now + randomInteger(7, 13, random) * 1_000,
              status: 'listed' as const,
            }
          : item,
      ),
    },
    `${vehicle.model} publiée à ${normalizedPrice.toLocaleString('fr-FR')} €.`,
    'neutral',
    random,
  )
}

const createOffer = (vehicle: OwnedVehicle, random: RandomSource) => {
  const askingPrice = vehicle.askingPrice ?? getVehicleResaleValue(vehicle)
  const fairValue = getVehicleResaleValue(vehicle)
  const rawOffer = askingPrice * randomBetween(0.92, 1.005, random)
  return roundTo(Math.min(rawOffer, fairValue * 1.04), 100)
}

export const acceptOffer = (
  state: GameState,
  vehicleId: string,
  random: RandomSource = Math.random,
) => {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (!vehicle || vehicle.kept || vehicle.status !== 'offer-received' || !vehicle.offerAmount) return state
  const profit = vehicle.offerAmount - getVehicleInvestment(vehicle)
  return withNotification(
    {
      ...state,
      cash: state.cash + vehicle.offerAmount,
      profitToday: state.profitToday + profit,
      vehicles: state.vehicles.filter((item) => item.id !== vehicleId),
    },
    `${vehicle.model} vendue : +${vehicle.offerAmount.toLocaleString('fr-FR')} € · marge ${profit >= 0 ? '+' : '−'}${Math.abs(profit).toLocaleString('fr-FR')} €.`,
    profit >= 0 ? 'success' : 'warning',
    random,
  )
}

export const rejectOffer = (
  state: GameState,
  vehicleId: string,
  now: number,
  random: RandomSource = Math.random,
) => {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (!vehicle || vehicle.status !== 'offer-received') return state
  return withNotification(
    {
      ...state,
      vehicles: state.vehicles.map((item) =>
        item.id === vehicleId
          ? {
              ...item,
              offerAmount: undefined,
              nextOfferAt: now + randomInteger(6, 11, random) * 1_000,
              status: 'listed' as const,
            }
          : item,
      ),
    },
    `Offre refusée pour la ${vehicle.model}. L’annonce reste active.`,
    'neutral',
    random,
  )
}

export const toggleVehicleKept = (
  state: GameState,
  vehicleId: string,
  random: RandomSource = Math.random,
) => {
  const vehicle = state.vehicles.find((item) => item.id === vehicleId)
  if (!vehicle) return state
  const kept = !vehicle.kept
  const cancelsListing = kept && (vehicle.status === 'listed' || vehicle.status === 'offer-received')
  const vehicles = state.vehicles.map((item) => {
    if (item.id !== vehicleId) return item
    return {
      ...item,
      kept,
      ...(cancelsListing
        ? {
            status: 'ready' as const,
            askingPrice: undefined,
            saleChance: undefined,
            nextOfferAt: undefined,
            offerAmount: undefined,
          }
        : {}),
    }
  })

  return withNotification(
    { ...state, vehicles },
    kept
      ? `${vehicle.model} rejoint la collection${cancelsListing ? ' · annonce retirée' : ''}.`
      : `${vehicle.model} repasse dans le stock actif.`,
    'neutral',
    random,
  )
}

export const acquireProperty = (
  state: GameState,
  offerId: string,
  now: number,
  random: RandomSource = Math.random,
) => {
  const offer = PROPERTY_MARKET.find((item) => item.id === offerId)
  if (!offer || state.properties.some((property) => property.id === offerId)) return state
  if (state.cash < offer.acquisitionCost) {
    return withNotification(state, 'Trésorerie insuffisante pour acquérir ce local.', 'warning', random)
  }

  const operational = offer.workCost === 0
  const property: OwnedProperty = {
    ...offer,
    instanceId: makeId('property', now, random),
    status: operational ? 'operational' : 'works-required',
    acquiredAt: now,
    nextChargeAt: now + PROPERTY_CHARGE_CYCLE_MS,
  }

  return withNotification(
    {
      ...state,
      cash: state.cash - offer.acquisitionCost,
      properties: [...state.properties, property],
    },
    operational
      ? `${offer.name} opérationnel · +${offer.capacity} places.`
      : `${offer.name} acquis. Les travaux restent à lancer.`,
    'success',
    random,
  )
}

export const startPropertyWorks = (
  state: GameState,
  propertyId: string,
  now: number,
  random: RandomSource = Math.random,
) => {
  const property = state.properties.find((item) => item.instanceId === propertyId)
  if (!property || property.status !== 'works-required') return state
  if (state.cash < property.workCost) {
    return withNotification(state, 'Trésorerie insuffisante pour lancer ces travaux.', 'warning', random)
  }

  return withNotification(
    {
      ...state,
      cash: state.cash - property.workCost,
      properties: state.properties.map((item) =>
        item.instanceId === propertyId
          ? {
              ...item,
              status: 'renovating' as const,
              workStartedAt: now,
              workCompletesAt: now + property.workDurationSeconds * 1_000,
            }
          : item,
      ),
    },
    `Travaux lancés dans ${property.name}.`,
    'neutral',
    random,
  )
}

export const advanceGame = (
  state: GameState,
  now: number,
  random: RandomSource = Math.random,
): GameState => {
  let changed = false
  let notifications = state.notifications
  let cash = state.cash
  let chargedAmount = 0
  const currentDayKey = getDayKey(now)
  const profitToday = currentDayKey === state.profitDayKey ? state.profitToday : 0
  if (profitToday !== state.profitToday) changed = true

  const addNotification = (message: string, tone: GameNotification['tone']) => {
    notifications = [
      ...notifications.slice(-2),
      { id: makeId('note', now, random), tone, message },
    ]
  }

  const vehicles = state.vehicles.map((vehicle) => {
    if (vehicle.status === 'repairing' && vehicle.repairCompletesAt && vehicle.repairCompletesAt <= now) {
      changed = true
      const completedCount = vehicle.problems.filter((problem) => problem.selectedForRepair).length
      const remainingCount = vehicle.problems.filter(
        (problem) => !problem.repaired && !problem.selectedForRepair,
      ).length
      addNotification(
        remainingCount > 0
          ? `${completedCount} intervention${completedCount > 1 ? 's' : ''} terminée${completedCount > 1 ? 's' : ''} sur la ${vehicle.model} · ${remainingCount} défaut${remainingCount > 1 ? 's' : ''} restant${remainingCount > 1 ? 's' : ''}.`
          : `${vehicle.model} réparée. Elle peut maintenant être mise en vente.`,
        remainingCount > 0 ? 'neutral' : 'success',
      )
      return {
        ...vehicle,
        problems: vehicle.problems.map((problem) => ({
          ...problem,
          repaired: problem.repaired || problem.selectedForRepair,
          selectedForRepair: false,
        })),
        repairStartedAt: undefined,
        repairCompletesAt: undefined,
        status: 'ready' as const,
      }
    }

    if (vehicle.status === 'listed' && vehicle.nextOfferAt && vehicle.nextOfferAt <= now) {
      changed = true
      if (boundedRandom(random) <= (vehicle.saleChance ?? 0.5)) {
        const offerAmount = createOffer(vehicle, random)
        addNotification(
          `Nouvelle offre pour la ${vehicle.model} : ${offerAmount.toLocaleString('fr-FR')} €.`,
          'success',
        )
        return { ...vehicle, offerAmount, status: 'offer-received' as const }
      }
      return {
        ...vehicle,
        nextOfferAt: now + randomInteger(6, 11, random) * 1_000,
      }
    }

    return vehicle
  })

  const properties = state.properties.map((property) => {
    let nextProperty = property

    if (
      property.status === 'renovating' &&
      property.workCompletesAt &&
      property.workCompletesAt <= now
    ) {
      changed = true
      nextProperty = {
        ...property,
        status: 'operational' as const,
        workCompletesAt: undefined,
      }
      addNotification(`${property.name} est opérationnel · +${property.capacity} places.`, 'success')
    }

    if (nextProperty.nextChargeAt <= now) {
      const elapsedCycles = Math.floor(
        (now - nextProperty.nextChargeAt) / PROPERTY_CHARGE_CYCLE_MS,
      ) + 1
      chargedAmount += getPropertyCycleCost(nextProperty) * elapsedCycles
      changed = true
      nextProperty = {
        ...nextProperty,
        nextChargeAt: nextProperty.nextChargeAt + elapsedCycles * PROPERTY_CHARGE_CYCLE_MS,
      }
    }

    return nextProperty
  })

  if (chargedAmount > 0) {
    cash -= chargedAmount
    addNotification(
      `Échéances immobilières prélevées : ${chargedAmount.toLocaleString('fr-FR')} €.`,
      cash < 0 ? 'warning' : 'neutral',
    )
    if (cash < 0) {
      addNotification(
        `Découvert : −${Math.abs(cash).toLocaleString('fr-FR')} €, réduis tes charges ou vends un véhicule.`,
        'warning',
      )
    }
  }

  const activeListings = state.listings.filter((listing) => listing.expiresAt > now)
  if (activeListings.length !== state.listings.length) changed = true

  let nextState: GameState = changed
    ? {
        ...state,
        cash,
        profitToday,
        profitDayKey: currentDayKey,
        vehicles,
        properties,
        listings: activeListings,
        notifications,
      }
    : state

  return refreshMarkets(nextState, now, random)
}
