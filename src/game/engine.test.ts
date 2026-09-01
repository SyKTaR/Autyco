import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acceptOffer,
  acquireProperty,
  advanceGame,
  buyListing,
  createInitialGame,
  diagnoseVehicle,
  getGarageCapacity,
  getRepairCost,
  getVehicleResaleValue,
  listVehicle,
  skipRepair,
  startPropertyWorks,
  startRepair,
  toggleVehicleKept,
} from './engine'
import { PROPERTY_CHARGE_CYCLE_MS } from './properties'

const fixedRandom = () => 0.1

describe('boucle de jeu', () => {
  it('génère un marché de dix véhicules distincts', () => {
    const game = createInitialGame(1_000, fixedRandom)
    assert.equal(game.listings.length, 10)
    assert.equal(new Set(game.listings.map((listing) => listing.templateId)).size, 10)
    assert.equal(getGarageCapacity(game), 3)
    assert.equal(game.cash, 20_000)
  })

  it('partage la capacité entre stock et collection et interdit la vente d’un véhicule gardé', () => {
    let game = createInitialGame(1_000, fixedRandom)
    game = { ...game, cash: 100_000 }

    for (let index = 0; index < 3; index += 1) {
      game = buyListing(game, game.listings[0].id, 2_000 + index, fixedRandom)
    }
    assert.equal(game.vehicles.length, 3)

    const keptVehicleId = game.vehicles[0].id
    game = toggleVehicleKept(game, keptVehicleId, fixedRandom)
    assert.equal(game.vehicles[0].kept, true)

    game = buyListing(game, game.listings[0].id, 3_000, fixedRandom)
    assert.equal(game.vehicles.length, 3, 'la collection doit toujours occuper sa place')

    game = diagnoseVehicle(game, keptVehicleId, fixedRandom)
    game = skipRepair(game, keptVehicleId, fixedRandom)
    const beforeListAttempt = game
    game = listVehicle(game, keptVehicleId, 15_000, 4_000, fixedRandom)
    assert.equal(game, beforeListAttempt)
    assert.equal(game.vehicles[0].status, 'ready')

    game = toggleVehicleKept(game, keptVehicleId, fixedRandom)
    game = listVehicle(game, keptVehicleId, 15_000, 4_100, fixedRandom)
    assert.equal(game.vehicles[0].status, 'listed')
  })

  it('acquiert plusieurs locaux et ajoute leur capacité après les travaux', () => {
    let game = createInitialGame(10_000, fixedRandom)
    game = { ...game, cash: 100_000 }

    game = acquireProperty(game, 'box-quartier', 11_000, fixedRandom)
    assert.equal(game.properties.length, 1)
    assert.equal(game.properties[0].status, 'operational')
    assert.equal(getGarageCapacity(game), 5)

    game = acquireProperty(game, 'atelier-cour', 12_000, fixedRandom)
    assert.equal(game.properties.length, 2)
    assert.equal(game.properties[1].status, 'works-required')
    assert.equal(getGarageCapacity(game), 5)

    const atelier = game.properties[1]
    game = startPropertyWorks(game, atelier.instanceId, 13_000, fixedRandom)
    assert.equal(game.properties[1].status, 'renovating')
    game = advanceGame(game, 13_000 + atelier.workDurationSeconds * 1_000, fixedRandom)
    assert.equal(game.properties[1].status, 'operational')
    assert.equal(getGarageCapacity(game), 9)
  })

  it('prélève les cycles de charges écoulés hors ligne sans bloquer le découvert', () => {
    const acquiredAt = 50_000
    let game = createInitialGame(acquiredAt, fixedRandom)
    game = acquireProperty(game, 'box-quartier', acquiredAt, fixedRandom)
    game = { ...game, cash: 300 }

    game = advanceGame(game, acquiredAt + PROPERTY_CHARGE_CYCLE_MS * 2 + 1, fixedRandom)

    assert.equal(game.cash, 300 - 2 * (180 + 35))
    assert.equal(
      game.properties[0].nextChargeAt,
      acquiredAt + PROPERTY_CHARGE_CYCLE_MS * 3,
    )
    assert.ok(game.notifications.some((notification) => notification.message.includes('Découvert')))
  })

  it('parcourt achat, diagnostic, réparation, offre et encaissement', () => {
    const startedAt = 10_000
    let game = createInitialGame(startedAt, fixedRandom)
    const listing = game.listings[0]

    game = buyListing(game, listing.id, startedAt + 100, fixedRandom)
    assert.equal(game.vehicles.length, 1)
    assert.equal(game.vehicles[0].status, 'needs-diagnosis')
    assert.equal(game.cash, 20_000 - listing.askingPrice)

    game = diagnoseVehicle(game, game.vehicles[0].id, fixedRandom)
    assert.equal(game.vehicles[0].status, 'needs-decision')
    assert.ok(game.vehicles[0].problems.length > 0)

    const repairCost = getRepairCost(game.vehicles[0])
    game = startRepair(game, game.vehicles[0].id, startedAt + 200, fixedRandom)
    assert.equal(game.vehicles[0].status, 'repairing')
    assert.equal(game.cash, 20_000 - listing.askingPrice - repairCost)

    game = advanceGame(game, startedAt + 30_000, fixedRandom)
    assert.equal(game.vehicles[0].status, 'ready')
    assert.ok(game.vehicles[0].problems.every((problem) => problem.repaired))

    const salePrice = getVehicleResaleValue(game.vehicles[0])
    game = listVehicle(game, game.vehicles[0].id, salePrice, startedAt + 31_000, fixedRandom)
    assert.equal(game.vehicles[0].status, 'listed')

    game = advanceGame(game, startedAt + 60_000, () => 0)
    assert.equal(game.vehicles[0].status, 'offer-received')
    assert.ok((game.vehicles[0].offerAmount ?? 0) > 0)

    const cashBeforeSale = game.cash
    const offer = game.vehicles[0].offerAmount ?? 0
    game = acceptOffer(game, game.vehicles[0].id, fixedRandom)
    assert.equal(game.vehicles.length, 0)
    assert.equal(game.cash, cashBeforeSale + offer)
    assert.notEqual(game.profitToday, 0)
  })
})
