import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  CRITICAL_RESALE_CAP_FACTOR,
  MARKET_CONFIG,
  MARKET_TIERS,
  acceptOffer,
  acquireProperty,
  advanceGame,
  buyListing,
  createInitialGame,
  diagnoseVehicle,
  getGarageCapacity,
  getMaximumAskingPrice,
  getRepairCost,
  getVehicleResaleValue,
  ignoreListing,
  listVehicle,
  skipRepair,
  startPropertyWorks,
  startRepair,
  toggleVehicleKept,
} from './engine'
import { PROBLEM_CATALOG } from './catalog'
import { PROPERTY_CHARGE_CYCLE_MS } from './properties'

const fixedRandom = () => 0.1

describe('boucle de jeu', () => {
  it('génère trois marchés distincts avec leurs volumes et cadences propres', () => {
    const game = createInitialGame(1_000, fixedRandom)
    assert.equal(game.listings.length, 13)
    assert.equal(new Set(game.listings.map((listing) => listing.templateId)).size, 13)
    assert.deepEqual(
      Object.fromEntries(MARKET_TIERS.map((market) => [
        market,
        game.listings.filter((listing) => listing.market === market).length,
      ])),
      { standard: 7, premium: 4, collector: 2 },
    )
    for (const market of MARKET_TIERS) {
      const [minimum, maximum] = MARKET_CONFIG[market].refreshSeconds
      const delay = (game.marketRefreshAt[market] - 1_000) / 1_000
      assert.ok(delay >= minimum && delay <= maximum)
      assert.ok(
        game.listings
          .filter((listing) => listing.market === market)
          .every((listing) => listing.expiresAt === game.marketRefreshAt[market]),
      )
    }
    assert.equal(getGarageCapacity(game), 3)
    assert.equal(game.cash, 20_000)
  })

  it('ne remplace pas une annonce achetée ou ignorée avant la rotation de sa gamme', () => {
    let game = { ...createInitialGame(1_000, fixedRandom), cash: 1_000_000 }
    const rareListing = game.listings.find((listing) => listing.market === 'collector')!
    const rareRefreshAt = game.marketRefreshAt.collector

    game = buyListing(game, rareListing.id, 2_000, fixedRandom)
    assert.equal(game.listings.filter((listing) => listing.market === 'collector').length, 1)
    assert.match(game.notifications.at(-1)?.message ?? '', /1\/3 places occupées/)

    const remainingRare = game.listings.find((listing) => listing.market === 'collector')!
    game = ignoreListing(game, remainingRare.id, 3_000, fixedRandom)
    assert.equal(game.listings.filter((listing) => listing.market === 'collector').length, 0)

    game = advanceGame(game, rareRefreshAt - 1, fixedRandom)
    assert.equal(game.listings.filter((listing) => listing.market === 'collector').length, 0)

    game = advanceGame(game, rareRefreshAt, fixedRandom)
    assert.equal(game.listings.filter((listing) => listing.market === 'collector').length, 2)
    assert.ok(game.marketRefreshAt.collector > rareRefreshAt)
  })

  it('classe les organes de sécurité et la distribution comme grosses pannes', () => {
    assert.deepEqual(
      PROBLEM_CATALOG.filter((problem) => problem.severity === 'critical')
        .map((problem) => problem.id),
      ['brakes', 'tires', 'timing'],
    )
    assert.deepEqual(
      PROBLEM_CATALOG.filter((problem) => problem.severity === 'minor')
        .map((problem) => problem.id),
      ['battery', 'bodywork', 'service'],
    )
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
    game = listVehicle(
      game,
      keptVehicleId,
      getVehicleResaleValue(game.vehicles[0]),
      4_100,
      fixedRandom,
    )
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
    game = startRepair(
      game,
      game.vehicles[0].id,
      game.vehicles[0].problems.map((problem) => problem.id),
      startedAt + 200,
      fixedRandom,
    )
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

  it('ne facture et ne répare que les postes sélectionnés', () => {
    let game = createInitialGame(1_000, fixedRandom)
    const brakes = PROBLEM_CATALOG.find((problem) => problem.id === 'brakes')!
    const bodywork = PROBLEM_CATALOG.find((problem) => problem.id === 'bodywork')!
    const vehicle = {
      ...game.vehicles[0],
      id: 'vehicle-selective',
      listingId: 'listing-selective',
      templateId: 'clio-v',
      maker: 'Renault',
      model: 'Clio V',
      segment: 'Citadine',
      year: 2021,
      mileage: 50_000,
      purchasePrice: 10_000,
      marketValue: 20_000,
      risk: 'high' as const,
      status: 'needs-decision' as const,
      problems: [brakes, bodywork].map((problem) => ({
        ...problem,
        repaired: false,
        selectedForRepair: false,
      })),
      repairCosts: 0,
      repairsSkipped: false,
      kept: false,
      acquiredAt: 1_000,
    }
    game = { ...game, cash: 5_000, vehicles: [vehicle] }

    assert.equal(getRepairCost(vehicle, ['brakes']), brakes.cost)
    game = startRepair(game, vehicle.id, ['brakes'], 2_000, fixedRandom)

    assert.equal(game.cash, 5_000 - brakes.cost)
    assert.equal(game.vehicles[0].repairCosts, brakes.cost)
    assert.equal(game.vehicles[0].repairsSkipped, true)
    assert.equal(game.vehicles[0].problems[0].selectedForRepair, true)
    assert.equal(game.vehicles[0].problems[1].selectedForRepair, false)

    game = advanceGame(game, 30_000, fixedRandom)
    assert.equal(game.vehicles[0].status, 'ready')
    assert.equal(game.vehicles[0].problems[0].repaired, true)
    assert.equal(game.vehicles[0].problems[1].repaired, false)
    assert.ok(game.vehicles[0].problems.every((problem) => !problem.selectedForRepair))
    assert.equal(getVehicleResaleValue(game.vehicles[0]), 18_900)
  })

  it('plafonne une vente avec grosse panne et conserve la décote proportionnelle des détails', () => {
    const brakes = PROBLEM_CATALOG.find((problem) => problem.id === 'brakes')!
    const bodywork = PROBLEM_CATALOG.find((problem) => problem.id === 'bodywork')!
    const baseProblem = { repaired: false, selectedForRepair: false }
    const game = createInitialGame(1_000, fixedRandom)
    const vehicle = {
      id: 'vehicle-cap',
      listingId: 'listing-cap',
      templateId: 'clio-v',
      maker: 'Renault',
      model: 'Clio V',
      segment: 'Citadine',
      year: 2021,
      mileage: 50_000,
      purchasePrice: 10_000,
      marketValue: 20_000,
      risk: 'high' as const,
      status: 'ready' as const,
      problems: [{ ...brakes, ...baseProblem }, { ...bodywork, ...baseProblem }],
      repairCosts: 0,
      repairsSkipped: true,
      kept: false,
      acquiredAt: 1_000,
    }
    const criticalState = { ...game, vehicles: [vehicle] }
    const criticalCap = 20_000 * CRITICAL_RESALE_CAP_FACTOR

    assert.equal(getVehicleResaleValue(vehicle), criticalCap)
    assert.equal(getMaximumAskingPrice(vehicle), criticalCap)

    const rejected = listVehicle(criticalState, vehicle.id, 20_000, 2_000, fixedRandom)
    assert.equal(rejected.vehicles[0].status, 'ready')
    assert.match(rejected.notifications.at(-1)?.message ?? '', /Prix plafonné/)

    const accepted = listVehicle(criticalState, vehicle.id, criticalCap, 2_000, fixedRandom)
    assert.equal(accepted.vehicles[0].status, 'listed')

    const minorOnly = {
      ...vehicle,
      problems: [{ ...bodywork, ...baseProblem }],
    }
    assert.equal(getVehicleResaleValue(minorOnly), 18_900)
    assert.equal(getMaximumAskingPrice(minorOnly), null)
  })
})
