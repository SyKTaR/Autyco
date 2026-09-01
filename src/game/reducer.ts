import type { GameAction, GameState } from '../types/game'
import {
  acceptOffer,
  acquireProperty,
  advanceGame,
  buyListing,
  diagnoseVehicle,
  ignoreListing,
  listVehicle,
  rejectOffer,
  skipRepair,
  startRepair,
  startPropertyWorks,
  toggleVehicleKept,
} from './engine'

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'BUY_LISTING':
      return buyListing(state, action.listingId, action.now)
    case 'IGNORE_LISTING':
      return ignoreListing(state, action.listingId, action.now)
    case 'DIAGNOSE_VEHICLE':
      return diagnoseVehicle(state, action.vehicleId)
    case 'START_REPAIR':
      return startRepair(state, action.vehicleId, action.now)
    case 'SKIP_REPAIR':
      return skipRepair(state, action.vehicleId)
    case 'LIST_VEHICLE':
      return listVehicle(state, action.vehicleId, action.price, action.now)
    case 'ACCEPT_OFFER':
      return acceptOffer(state, action.vehicleId)
    case 'REJECT_OFFER':
      return rejectOffer(state, action.vehicleId, action.now)
    case 'TOGGLE_VEHICLE_KEPT':
      return toggleVehicleKept(state, action.vehicleId)
    case 'ACQUIRE_PROPERTY':
      return acquireProperty(state, action.offerId, action.now)
    case 'START_PROPERTY_WORKS':
      return startPropertyWorks(state, action.propertyId, action.now)
    case 'DISMISS_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.filter(
          (notification) => notification.id !== action.notificationId,
        ),
      }
    case 'TICK':
      return advanceGame(state, action.now)
    default:
      return state
  }
}
