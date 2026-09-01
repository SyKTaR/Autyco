export type RiskLevel = 'low' | 'medium' | 'high'

export type VehicleStatus =
  | 'needs-diagnosis'
  | 'needs-decision'
  | 'repairing'
  | 'ready'
  | 'listed'
  | 'offer-received'

export interface VehicleTemplate {
  id: string
  maker: string
  model: string
  segment: string
  marketValue: number
  yearMin: number
  yearMax: number
  mileageMin: number
  mileageMax: number
}

export interface MarketListing {
  id: string
  templateId: string
  maker: string
  model: string
  segment: string
  year: number
  mileage: number
  askingPrice: number
  marketValue: number
  risk: RiskLevel
  conditionHint: string
  expiresAt: number
}

export interface VehicleProblem {
  id: string
  label: string
  detail: string
  cost: number
  durationSeconds: number
  resaleImpact: number
  repaired: boolean
}

export interface OwnedVehicle {
  id: string
  listingId: string
  templateId: string
  maker: string
  model: string
  segment: string
  year: number
  mileage: number
  purchasePrice: number
  marketValue: number
  risk: RiskLevel
  status: VehicleStatus
  problems: VehicleProblem[]
  repairCosts: number
  repairsSkipped: boolean
  kept: boolean
  acquiredAt: number
  repairStartedAt?: number
  repairCompletesAt?: number
  askingPrice?: number
  saleChance?: number
  nextOfferAt?: number
  offerAmount?: number
}

export type PropertyAcquisitionMode = 'rent' | 'purchase'
export type PropertyStatus = 'works-required' | 'renovating' | 'operational'

export interface PropertyOffer {
  id: string
  name: string
  district: string
  description: string
  capacity: number
  acquisitionMode: PropertyAcquisitionMode
  acquisitionCost: number
  rentPerCycle: number
  chargesPerCycle: number
  workCost: number
  workDurationSeconds: number
}

export interface OwnedProperty extends PropertyOffer {
  instanceId: string
  status: PropertyStatus
  acquiredAt: number
  nextChargeAt: number
  workStartedAt?: number
  workCompletesAt?: number
}

export interface GameNotification {
  id: string
  tone: 'neutral' | 'success' | 'warning'
  message: string
}

export interface GameState {
  version: 2
  cash: number
  profitToday: number
  profitDayKey: string
  vehicles: OwnedVehicle[]
  properties: OwnedProperty[]
  listings: MarketListing[]
  notifications: GameNotification[]
}

export type GameAction =
  | { type: 'BUY_LISTING'; listingId: string; now: number }
  | { type: 'IGNORE_LISTING'; listingId: string; now: number }
  | { type: 'DIAGNOSE_VEHICLE'; vehicleId: string }
  | { type: 'START_REPAIR'; vehicleId: string; now: number }
  | { type: 'SKIP_REPAIR'; vehicleId: string }
  | { type: 'LIST_VEHICLE'; vehicleId: string; price: number; now: number }
  | { type: 'ACCEPT_OFFER'; vehicleId: string }
  | { type: 'REJECT_OFFER'; vehicleId: string; now: number }
  | { type: 'TOGGLE_VEHICLE_KEPT'; vehicleId: string }
  | { type: 'ACQUIRE_PROPERTY'; offerId: string; now: number }
  | { type: 'START_PROPERTY_WORKS'; propertyId: string; now: number }
  | { type: 'DISMISS_NOTIFICATION'; notificationId: string }
  | { type: 'TICK'; now: number }
