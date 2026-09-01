import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  acquireProperty,
  advanceGame,
  buyListing,
  createInitialGame,
  diagnoseVehicle,
  getPropertyCycleCost,
  listVehicle,
  skipRepair,
  startPropertyWorks,
  startRepair,
} from './engine'
import {
  createReturnSummary,
  getGarageActionCount,
  getPropertyActionCount,
} from './returnSummary'

const fixedRandom = () => 0.1

describe('résumé de retour', () => {
  it('résume les événements réellement survenus pendant une absence', () => {
    const startedAt = 10_000
    let previous = createInitialGame(startedAt, fixedRandom)
    previous = { ...previous, cash: 100_000 }
    previous = buyListing(previous, previous.listings[0].id, startedAt + 100, fixedRandom)
    previous = diagnoseVehicle(previous, previous.vehicles[0].id, fixedRandom)
    previous = startRepair(previous, previous.vehicles[0].id, startedAt + 200, fixedRandom)
    previous = acquireProperty(previous, 'atelier-cour', startedAt + 300, fixedRandom)
    previous = startPropertyWorks(previous, previous.properties[0].instanceId, startedAt + 400, fixedRandom)

    const returnedAt = startedAt + 60_000
    const current = advanceGame(previous, returnedAt, fixedRandom)
    const summary = createReturnSummary(previous, current, startedAt, returnedAt)

    assert.ok(summary)
    assert.equal(summary.repairsCompleted, 1)
    assert.equal(summary.propertiesOpened, 1)
    assert.equal(summary.offersReceived, 0)
    assert.equal(summary.awayDurationMs, 60_000)
    assert.equal(summary.actionCount, 1)
  })

  it('ne présente rien pour une interruption courte ou sans changement', () => {
    const previous = createInitialGame(1_000, fixedRandom)
    assert.equal(createReturnSummary(previous, previous, 1_000, 20_000), null)
    assert.equal(createReturnSummary(previous, previous, 1_000, 80_000), null)
  })

  it('signale une offre et le prélèvement intervenus hors ligne', () => {
    const startedAt = 10_000
    let previous = createInitialGame(startedAt, fixedRandom)
    previous = { ...previous, cash: 100_000 }
    previous = buyListing(previous, previous.listings[0].id, startedAt + 100, fixedRandom)
    previous = diagnoseVehicle(previous, previous.vehicles[0].id, fixedRandom)
    previous = skipRepair(previous, previous.vehicles[0].id, fixedRandom)
    previous = listVehicle(previous, previous.vehicles[0].id, 10_000, startedAt + 200, fixedRandom)
    previous = acquireProperty(previous, 'box-quartier', startedAt + 300, fixedRandom)
    previous = {
      ...previous,
      properties: previous.properties.map((property) => ({
        ...property,
        nextChargeAt: startedAt + 30_000,
      })),
    }

    const returnedAt = startedAt + 60_000
    const current = advanceGame(previous, returnedAt, fixedRandom)
    const summary = createReturnSummary(previous, current, startedAt, returnedAt)

    assert.ok(summary)
    assert.equal(summary.offersReceived, 1)
    assert.equal(summary.cashDelta, -getPropertyCycleCost(previous.properties[0]))
  })

  it('compte uniquement les décisions disponibles', () => {
    let state = createInitialGame(1_000, fixedRandom)
    state = buyListing(state, state.listings[0].id, 2_000, fixedRandom)
    state = acquireProperty({ ...state, cash: 100_000 }, 'atelier-cour', 3_000, fixedRandom)

    assert.equal(getGarageActionCount(state), 1)
    assert.equal(getPropertyActionCount(state), 1)
  })
})
