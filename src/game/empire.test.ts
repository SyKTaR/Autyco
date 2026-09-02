import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  MECHANIC_DIAGNOSIS_SECONDS,
  MECHANIC_LISTING_SECONDS,
  SHOWROOM_CAPACITY,
  STAFF_CONFIG,
  acceptShowroomOffer,
  acquireProperty,
  advanceGame,
  buyListing,
  createInitialGame,
  hireStaff,
  toggleShowroomVehicle,
  toggleVehicleKept,
  updateCommercialSettings,
} from './engine'
import { GRAND_GARAGE_ID, PROPERTY_CHARGE_CYCLE_MS, PROPERTY_MARKET } from './properties'

const fixedRandom = () => 0.1

const withGrandGarage = (now = 1_000) => {
  const game = { ...createInitialGame(now, fixedRandom), cash: 2_000_000 }
  return acquireProperty(game, GRAND_GARAGE_ID, now, fixedRandom)
}

describe('palier Empire', () => {
  it('place le Grand Garage à 750 000 € avec une capacité et des charges de fin de partie', () => {
    const grandGarage = PROPERTY_MARKET.find((property) => property.id === GRAND_GARAGE_ID)
    assert.ok(grandGarage)
    assert.equal(grandGarage.acquisitionCost, 750_000)
    assert.equal(grandGarage.capacity, 24)
    assert.equal(grandGarage.chargesPerCycle, 4_500)

    let exactBudgetGame = { ...createInitialGame(1_000, fixedRandom), cash: 750_000 }
    exactBudgetGame = acquireProperty(exactBudgetGame, GRAND_GARAGE_ID, 1_001, fixedRandom)
    exactBudgetGame = hireStaff(exactBudgetGame, 'mechanic', 1_002, fixedRandom)
    assert.equal(exactBudgetGame.staff.length, 0, 'acheter le bâtiment ne doit pas financer le staff')
  })

  it('respecte les plafonds configurables de 2 garagistes et 1 commercial', () => {
    let game = withGrandGarage()
    game = hireStaff(game, 'mechanic', 2_000, fixedRandom)
    game = hireStaff(game, 'mechanic', 2_001, fixedRandom)
    const beforeRejectedMechanic = game.cash
    game = hireStaff(game, 'mechanic', 2_002, fixedRandom)
    assert.equal(game.staff.filter((employee) => employee.role === 'mechanic').length, 2)
    assert.equal(game.cash, beforeRejectedMechanic)

    game = hireStaff(game, 'salesperson', 2_003, fixedRandom)
    const beforeRejectedSalesperson = game.cash
    game = hireStaff(game, 'salesperson', 2_004, fixedRandom)
    assert.equal(game.staff.filter((employee) => employee.role === 'salesperson').length, 1)
    assert.equal(game.cash, beforeRejectedSalesperson)
    assert.deepEqual(
      Object.fromEntries(Object.entries(STAFF_CONFIG).map(([role, config]) => [role, config.limit])),
      { mechanic: 2, salesperson: 1 },
    )
  })

  it('conserve un employé et le met clairement en pause si la paie hors ligne échoue', () => {
    const hiredAt = 10_000
    let game = withGrandGarage(hiredAt)
    game = hireStaff(game, 'mechanic', hiredAt, fixedRandom)
    game = { ...game, cash: 1_000 }

    game = advanceGame(game, hiredAt + PROPERTY_CHARGE_CYCLE_MS + 1, fixedRandom)

    assert.equal(game.staff.length, 1)
    assert.equal(game.staff[0].status, 'paused')
    assert.equal(game.staff[0].pausedReason, 'payroll')
    assert.equal(game.staff[0].salaryArrears, STAFF_CONFIG.mechanic.salaryPerCycle)
    assert.ok(game.notifications.some((notification) => notification.message.includes('personne n’a été supprimé')))
  })

  it('automatise diagnostic, réparation partielle et mise en vente plus lentement que le joueur', () => {
    const startedAt = 20_000
    let game = withGrandGarage(startedAt)
    game = hireStaff(game, 'mechanic', startedAt + 1, fixedRandom)
    const listing = game.listings.find((item) => item.market === 'standard')!
    game = buyListing(game, listing.id, startedAt + 2, fixedRandom)

    game = advanceGame(game, startedAt + 3, fixedRandom)
    assert.equal(game.mechanicJobs[0].stage, 'diagnosis')
    assert.equal(
      game.mechanicJobs[0].completesAt - game.mechanicJobs[0].startedAt,
      MECHANIC_DIAGNOSIS_SECONDS * 1_000,
    )

    game = advanceGame(game, game.mechanicJobs[0].completesAt, fixedRandom)
    assert.equal(game.vehicles[0].status, 'repairing')
    assert.equal(game.mechanicJobs[0].stage, 'repair')
    assert.ok((game.vehicles[0].repairCompletesAt ?? 0) > startedAt)

    game = advanceGame(game, game.mechanicJobs[0].completesAt, fixedRandom)
    assert.equal(game.vehicles[0].status, 'ready')
    assert.equal(game.mechanicJobs[0].stage, 'listing')

    game = advanceGame(game, game.mechanicJobs[0].completesAt, fixedRandom)
    assert.equal(game.vehicles[0].status, 'listed')
    assert.ok((game.vehicles[0].askingPrice ?? 0) > 0)
    assert.equal(MECHANIC_LISTING_SECONDS, 9)
  })

  it('expose au maximum quatre véhicules de collection et génère une offre visiteur distincte', () => {
    const startedAt = 30_000
    let game = withGrandGarage(startedAt)
    for (let index = 0; index < SHOWROOM_CAPACITY + 1; index += 1) {
      const listing = game.listings.find((item) => item.market === 'standard')!
      game = buyListing(game, listing.id, startedAt + game.vehicles.length + 1, fixedRandom)
      const vehicleId = game.vehicles.at(-1)!.id
      game = toggleVehicleKept(game, vehicleId, fixedRandom)
      game = toggleShowroomVehicle(game, vehicleId, startedAt + 100, fixedRandom)
    }
    assert.equal(game.showroomVehicleIds.length, SHOWROOM_CAPACITY)

    game = { ...game, nextShowroomOfferAt: startedAt + 200 }
    game = advanceGame(game, startedAt + 200, fixedRandom)
    assert.equal(game.showroomOffers.length, 1)
    assert.equal(game.listings.some((listing) => listing.id === game.showroomOffers[0].id), false)

    const offer = game.showroomOffers[0]
    const soldVehicleId = offer.vehicleId
    const cashBefore = game.cash
    assert.equal(
      acceptShowroomOffer(game, offer.id, offer.expiresAt, fixedRandom),
      game,
      'une proposition expirée ne doit pas pouvoir être encaissée',
    )
    game = acceptShowroomOffer(game, offer.id, startedAt + 201, fixedRandom)
    assert.equal(game.vehicles.some((vehicle) => vehicle.id === soldVehicleId), false)
    assert.equal(game.showroomVehicleIds.includes(soldVehicleId), false)
    assert.ok(game.cash > cashBefore)
  })

  it('interdit toujours Rare / Collection au commercial, même si l’affaire y est meilleure', () => {
    const startedAt = 40_000
    let game = withGrandGarage(startedAt)
    game = hireStaff(game, 'salesperson', startedAt + 1, fixedRandom)
    game = updateCommercialSettings(game, {
      enabled: true,
      maxPurchasePrice: 100_000,
      minDiscountPercent: 5,
      marketProfile: 'both',
    }, startedAt + 2, fixedRandom)

    const collector = game.listings.find((listing) => listing.market === 'collector')!
    const standard = game.listings.find((listing) => listing.market === 'standard')!
    game = {
      ...game,
      listings: [
        { ...collector, askingPrice: 1_000, marketValue: 100_000 },
        { ...standard, askingPrice: 5_000, marketValue: 20_000 },
      ],
      nextCommercialActionAt: startedAt + 3,
    }

    game = advanceGame(game, startedAt + 3, fixedRandom)

    assert.equal(game.vehicles.length, 1)
    assert.equal(game.vehicles[0].templateId, standard.templateId)
    assert.equal(game.vehicles.some((vehicle) => vehicle.templateId === collector.templateId), false)
    assert.equal(game.listings.some((listing) => listing.market === 'collector'), true)
  })
})
